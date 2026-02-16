import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { BackupData, RestoreOptions } from '../types/backup.types';
import { AppError } from '../utils/errors';
import { validateUrlNotInternal } from '../utils/urlValidation';

/**
 * Statistics returned after a restore operation
 */
interface RestoreStats {
  tripsImported: number;
  locationsImported: number;
  photosImported: number;
  activitiesImported: number;
  transportationImported: number;
  lodgingImported: number;
  journalEntriesImported: number;
  tagsImported: number;
  companionsImported: number;
  travelDocumentsImported: number;
  tripLanguagesImported: number;
}

/**
 * Supported backup versions that can be restored
 * v1.0.0 - Original backup format
 * v1.1.0 - Added travelDocuments and tripLanguages
 */
const SUPPORTED_BACKUP_VERSIONS = ['1.0.0', '1.1.0', '1.2.0'];

/**
 * Restore user data from a backup
 */
export async function restoreFromBackup(
  userId: number,
  backupData: BackupData,
  options: RestoreOptions = { clearExistingData: true, importPhotos: true }
): Promise<{ success: boolean; message: string; stats: RestoreStats }> {
  // Validate backup version - support older versions for backward compatibility
  if (!SUPPORTED_BACKUP_VERSIONS.includes(backupData.version)) {
    throw new AppError(
      `Incompatible backup version. Supported versions: ${SUPPORTED_BACKUP_VERSIONS.join(', ')}, got ${backupData.version}`,
      400
    );
  }

  const stats = {
    tripsImported: 0,
    locationsImported: 0,
    photosImported: 0,
    activitiesImported: 0,
    transportationImported: 0,
    lodgingImported: 0,
    journalEntriesImported: 0,
    tagsImported: 0,
    companionsImported: 0,
    travelDocumentsImported: 0,
    tripLanguagesImported: 0,
  };

  try {
    // Use a transaction to ensure atomicity
    // @ts-expect-error -- Deep type instantiation in Prisma transaction with complex nested writes
    await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Step 1: Clear existing data if requested
        if (options.clearExistingData) {
          await clearUserData(userId, tx);
        }

        // Step 2: Update user settings
        // Preserve current timezone if the backup doesn't include one
        const currentUser = await tx.user.findUnique({
          where: { id: userId },
          select: { timezone: true },
        });
        // Validate Immich URL from backup to prevent SSRF
        let sanitizedImmichUrl = backupData.user.immichApiUrl;
        if (sanitizedImmichUrl) {
          try {
            await validateUrlNotInternal(sanitizedImmichUrl);
          } catch {
            sanitizedImmichUrl = null; // Reject URLs that fail SSRF validation
          }
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            timezone: backupData.user.timezone ?? currentUser?.timezone ?? 'UTC',
            activityCategories: backupData.user.activityCategories as Prisma.JsonArray,
            ...(backupData.user.tripTypes ? { tripTypes: backupData.user.tripTypes as Prisma.JsonArray } : {}),
            immichApiUrl: sanitizedImmichUrl,
            immichApiKey: sanitizedImmichUrl ? backupData.user.immichApiKey : null,
            weatherApiKey: backupData.user.weatherApiKey,
            aviationstackApiKey: backupData.user.aviationstackApiKey,
            openrouteserviceApiKey: backupData.user.openrouteserviceApiKey,
          },
        });

        // Step 3: Import tags
        const tagMap = new Map<string, number>(); // old name -> new ID
        for (const tag of backupData.tags) {
          const created = await tx.tripTag.create({
            data: {
              userId,
              name: tag.name,
              color: tag.color,
              textColor: tag.textColor,
            },
          });
          tagMap.set(tag.name, created.id);
          stats.tagsImported++;
        }

        // Step 4: Import companions
        const companionMap = new Map<string, number>(); // old name -> new ID
        for (const companion of backupData.companions) {
          const created = await tx.travelCompanion.create({
            data: {
              userId,
              name: companion.name,
              email: companion.email,
              phone: companion.phone,
              notes: companion.notes,
              relationship: companion.relationship,
              isMyself: companion.isMyself,
              avatarUrl: companion.avatarUrl,
              dietaryPreferences: companion.dietaryPreferences || [],
            },
          });
          companionMap.set(companion.name, created.id);
          stats.companionsImported++;
        }

        // Step 5: Import custom location categories
        const locationCategoryMap = new Map<string, number>(); // old name -> new ID
        for (const category of backupData.locationCategories) {
          const created = await tx.locationCategory.create({
            data: {
              userId,
              name: category.name,
              icon: category.icon,
              color: category.color,
              isDefault: category.isDefault,
            },
          });
          locationCategoryMap.set(category.name, created.id);
        }

        // Step 6: Import global checklists
        for (const checklist of backupData.checklists) {
          await tx.checklist.create({
            data: {
              userId,
              name: checklist.name,
              description: checklist.description,
              type: checklist.type,
              isDefault: checklist.isDefault,
              sortOrder: checklist.sortOrder,
              items: {
                create: checklist.items,
              },
            },
          });
        }

        // Step 6.5: Import travel documents (added in v1.1.0)
        // Note: Document numbers in backup are masked, so we don't restore them
        // Users will need to re-enter document numbers after restore for security
        if (backupData.travelDocuments) {
          for (const docData of backupData.travelDocuments) {
            // Check if a similar document already exists (by type + issuing country + name)
            // to avoid creating duplicates during merge
            const existingDoc = await tx.travelDocument.findFirst({
              where: {
                userId,
                type: docData.type,
                issuingCountry: docData.issuingCountry,
                name: docData.name,
              },
            });

            if (!existingDoc) {
              await tx.travelDocument.create({
                data: {
                  userId,
                  type: docData.type,
                  issuingCountry: docData.issuingCountry,
                  // Document number is masked in backup, don't restore it
                  // User will need to re-enter after restore
                  documentNumber: null,
                  issueDate: docData.issueDate ? new Date(docData.issueDate) : null,
                  expiryDate: docData.expiryDate ? new Date(docData.expiryDate) : null,
                  name: docData.name,
                  notes: docData.notes,
                  isPrimary: docData.isPrimary,
                  alertDaysBefore: docData.alertDaysBefore,
                },
              });
              stats.travelDocumentsImported++;
            }
          }
        }

        // Step 6.7: Import trip series (added in v1.2.0)
        const seriesMap = new Map<number, number>(); // old ID -> new ID
        if (backupData.tripSeries) {
          for (const seriesData of backupData.tripSeries) {
            const created = await tx.tripSeries.create({
              data: {
                userId,
                name: seriesData.name,
                description: seriesData.description || null,
              },
            });
            seriesMap.set(seriesData.id, created.id);
          }
        }

        // Step 7: Import trips with all related data
        for (const tripData of backupData.trips) {
          // Map seriesId from old to new
          const mappedSeriesId = tripData.seriesId ? seriesMap.get(tripData.seriesId) || null : null;

          // Create the trip
          const trip = await tx.trip.create({
            data: {
              userId,
              title: tripData.title,
              description: tripData.description,
              startDate: tripData.startDate ? new Date(tripData.startDate) : null,
              endDate: tripData.endDate ? new Date(tripData.endDate) : null,
              timezone: tripData.timezone,
              status: tripData.status,
              tripType: tripData.tripType || null,
              tripTypeEmoji: tripData.tripTypeEmoji || null,
              privacyLevel: tripData.privacyLevel,
              addToPlacesVisited: tripData.addToPlacesVisited,
              seriesId: mappedSeriesId,
              seriesOrder: mappedSeriesId ? (tripData.seriesOrder || null) : null,
            },
          });
          stats.tripsImported++;

          // Import locations (build ID mapping)
          const locationMap = new Map<number, number>(); // old ID -> new ID
          for (const locationData of tripData.locations || []) {
            // Find category ID if category exists
            let categoryId = null;
            if (locationData.category) {
              categoryId = locationCategoryMap.get(locationData.category.name) || null;
            }

            const location = await tx.location.create({
              data: {
                tripId: trip.id,
                parentId: null, // Set later in second pass
                name: locationData.name,
                address: locationData.address,
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                categoryId,
                visitDatetime: locationData.visitDatetime ? new Date(locationData.visitDatetime) : null,
                visitDurationMinutes: locationData.visitDurationMinutes,
                notes: locationData.notes,
              },
            });
            if (locationData.id != null) locationMap.set(locationData.id, location.id);
            stats.locationsImported++;
          }

          // Second pass: update parent location IDs
          for (const locationData of tripData.locations || []) {
            if (locationData.parentId && locationData.id != null) {
              const newLocationId = locationMap.get(locationData.id);
              const newParentId = locationMap.get(locationData.parentId);
              if (newLocationId && newParentId) {
                await tx.location.update({
                  where: { id: newLocationId },
                  data: { parentId: newParentId },
                });
              }
            }
          }

          // Import photos
          const photoMap = new Map<number, number>(); // old ID -> new ID
          if (options.importPhotos) {
            for (const photoData of tripData.photos || []) {
              const photo = await tx.photo.create({
                data: {
                  tripId: trip.id,
                  source: photoData.source,
                  immichAssetId: photoData.immichAssetId,
                  localPath: photoData.localPath,
                  thumbnailPath: photoData.thumbnailPath,
                  caption: photoData.caption,
                  latitude: photoData.latitude,
                  longitude: photoData.longitude,
                  takenAt: photoData.takenAt ? new Date(photoData.takenAt) : null,
                },
              });
              if (photoData.id != null) photoMap.set(photoData.id, photo.id);
              stats.photosImported++;
            }

            // Update trip with cover and banner photo IDs after photos are imported
            const newCoverPhotoId = tripData.coverPhotoId ? photoMap.get(tripData.coverPhotoId) : null;
            const newBannerPhotoId = tripData.bannerPhotoId ? photoMap.get(tripData.bannerPhotoId) : null;
            if (newCoverPhotoId || newBannerPhotoId) {
              await tx.trip.update({
                where: { id: trip.id },
                data: {
                  coverPhotoId: newCoverPhotoId || null,
                  bannerPhotoId: newBannerPhotoId || null,
                },
              });
            }
          }

          // Import activities (build ID mapping)
          // Note: Location associations are now handled via EntityLink system (restored separately below)
          const activityMap = new Map<number, number>(); // old ID -> new ID
          for (const activityData of tripData.activities || []) {
            const activity = await tx.activity.create({
              data: {
                tripId: trip.id,
                parentId: null, // Set later in second pass
                name: activityData.name,
                description: activityData.description,
                category: activityData.category,
                allDay: activityData.allDay,
                startTime: activityData.startTime ? new Date(activityData.startTime) : null,
                endTime: activityData.endTime ? new Date(activityData.endTime) : null,
                timezone: activityData.timezone,
                cost: activityData.cost,
                currency: activityData.currency,
                bookingUrl: activityData.bookingUrl,
                bookingReference: activityData.bookingReference,
                notes: activityData.notes,
                manualOrder: activityData.manualOrder,
              },
            });
            if (activityData.id != null) activityMap.set(activityData.id, activity.id);
            stats.activitiesImported++;
          }

          // Second pass: update parent activity IDs
          for (const activityData of tripData.activities || []) {
            if (activityData.parentId && activityData.id != null) {
              const newActivityId = activityMap.get(activityData.id);
              const newParentId = activityMap.get(activityData.parentId);
              if (newActivityId && newParentId) {
                await tx.activity.update({
                  where: { id: newActivityId },
                  data: { parentId: newParentId },
                });
              }
            }
          }

          // Import transportation
          const transportationMap = new Map<number, number>(); // old ID -> new ID
          for (const transportData of tripData.transportation || []) {
            const transportation = await tx.transportation.create({
              data: {
                tripId: trip.id,
                type: transportData.type,
                startLocationId: transportData.startLocationId
                  ? locationMap.get(transportData.startLocationId)
                  : null,
                startLocationText: transportData.startLocationText,
                endLocationId: transportData.endLocationId
                  ? locationMap.get(transportData.endLocationId)
                  : null,
                endLocationText: transportData.endLocationText,
                scheduledStart: transportData.scheduledStart ? new Date(transportData.scheduledStart) : null,
                scheduledEnd: transportData.scheduledEnd ? new Date(transportData.scheduledEnd) : null,
                startTimezone: transportData.startTimezone,
                endTimezone: transportData.endTimezone,
                actualStart: transportData.actualStart ? new Date(transportData.actualStart) : null,
                actualEnd: transportData.actualEnd ? new Date(transportData.actualEnd) : null,
                company: transportData.company,
                referenceNumber: transportData.referenceNumber,
                seatNumber: transportData.seatNumber,
                bookingReference: transportData.bookingReference,
                bookingUrl: transportData.bookingUrl,
                cost: transportData.cost,
                currency: transportData.currency,
                status: transportData.status,
                delayMinutes: transportData.delayMinutes,
                notes: transportData.notes,
                connectionGroupId: transportData.connectionGroupId,
                isAutoGenerated: transportData.isAutoGenerated,
                calculatedDistance: transportData.calculatedDistance,
                calculatedDuration: transportData.calculatedDuration,
                distanceSource: transportData.distanceSource,
              },
            });
            if (transportData.id != null) transportationMap.set(transportData.id, transportation.id);
            stats.transportationImported++;

            // Import flight tracking if exists
            if (transportData.flightTracking) {
              await tx.flightTracking.create({
                data: {
                  transportationId: transportation.id,
                  flightNumber: transportData.flightTracking.flightNumber,
                  airlineCode: transportData.flightTracking.airlineCode,
                  status: transportData.flightTracking.status,
                  gate: transportData.flightTracking.gate,
                  terminal: transportData.flightTracking.terminal,
                  baggageClaim: transportData.flightTracking.baggageClaim,
                },
              });
            }
          }

          // Import lodging
          // Note: Location associations are now handled via EntityLink system (restored separately below)
          const lodgingMap = new Map<number, number>(); // old ID -> new ID
          for (const lodgingData of tripData.lodging || []) {
            const lodging = await tx.lodging.create({
              data: {
                tripId: trip.id,
                type: lodgingData.type,
                name: lodgingData.name,
                address: lodgingData.address,
                checkInDate: new Date(lodgingData.checkInDate),
                checkOutDate: new Date(lodgingData.checkOutDate),
                timezone: lodgingData.timezone,
                confirmationNumber: lodgingData.confirmationNumber,
                bookingUrl: lodgingData.bookingUrl,
                cost: lodgingData.cost,
                currency: lodgingData.currency,
                notes: lodgingData.notes,
              },
            });
            if (lodgingData.id != null) lodgingMap.set(lodgingData.id, lodging.id);
            stats.lodgingImported++;
          }

          // Import journal entries
          for (const journalData of tripData.journalEntries || []) {
            await tx.journalEntry.create({
              data: {
                tripId: trip.id,
                date: journalData.date ? new Date(journalData.date) : null,
                title: journalData.title,
                content: journalData.content,
                entryType: journalData.entryType,
                mood: journalData.mood,
                weatherNotes: journalData.weatherNotes,
              },
            });
            stats.journalEntriesImported++;

            // Link photos
          }

          // Import photo albums
          // Note: Location, Activity, and Lodging associations are now handled via EntityLink system (restored separately below)
          const albumMap = new Map<number, number>(); // old ID -> new ID
          for (const albumData of tripData.photoAlbums || []) {
            const album = await tx.photoAlbum.create({
              data: {
                tripId: trip.id,
                name: albumData.name,
                description: albumData.description,
                coverPhotoId: albumData.coverPhotoId ? photoMap.get(albumData.coverPhotoId) : null,
              },
            });
            if (albumData.id != null) albumMap.set(albumData.id, album.id);

            // Link photos to album
            if (albumData.photos && options.importPhotos) {
              for (const photoRef of albumData.photos) {
                const newPhotoId = photoMap.get(photoRef.photoId);
                if (newPhotoId) {
                  await tx.photoAlbumAssignment.create({
                    data: {
                      albumId: album.id,
                      photoId: newPhotoId,
                      sortOrder: photoRef.sortOrder,
                    },
                  });
                }
              }
            }
          }

          // Import weather data
          for (const weatherData of tripData.weatherData || []) {
            await tx.weatherData.create({
              data: {
                tripId: trip.id,
                locationId: weatherData.locationId ? locationMap.get(weatherData.locationId) : null,
                date: new Date(weatherData.date),
                temperatureHigh: weatherData.temperatureHigh,
                temperatureLow: weatherData.temperatureLow,
                conditions: weatherData.conditions,
                precipitation: weatherData.precipitation,
                humidity: weatherData.humidity,
                windSpeed: weatherData.windSpeed,
              },
            });
          }

          // Link tags to trip
          if (tripData.tags) {
            for (const tagName of tripData.tags) {
              const tagId = tagMap.get(tagName);
              if (tagId) {
                await tx.tripTagAssignment.create({
                  data: {
                    tripId: trip.id,
                    tagId,
                  },
                });
              }
            }
          }

          // Link companions to trip
          if (tripData.companions) {
            for (const companionName of tripData.companions) {
              const companionId = companionMap.get(companionName);
              if (companionId) {
                await tx.tripCompanion.create({
                  data: {
                    tripId: trip.id,
                    companionId,
                  },
                });
              }
            }
          }

          // Import trip-specific checklists
          for (const checklistData of tripData.checklists || []) {
            await tx.checklist.create({
              data: {
                userId,
                tripId: trip.id,
                name: checklistData.name,
                description: checklistData.description,
                type: checklistData.type,
                isDefault: checklistData.isDefault,
                sortOrder: checklistData.sortOrder,
                items: {
                  create: checklistData.items,
                },
              },
            });
          }

          // Import EntityLinks (relationships between entities)
          // Helper function to map old IDs to new IDs based on entity type
          const getNewEntityId = (entityType: string, oldId: number): number | null => {
            switch (entityType) {
              case 'LOCATION':
                return locationMap.get(oldId) || null;
              case 'PHOTO':
                return photoMap.get(oldId) || null;
              case 'ACTIVITY':
                return activityMap.get(oldId) || null;
              case 'TRANSPORTATION':
                return transportationMap.get(oldId) || null;
              case 'LODGING':
                return lodgingMap.get(oldId) || null;
              case 'PHOTO_ALBUM':
                return albumMap.get(oldId) || null;
              default:
                return null;
            }
          };

          for (const linkData of tripData.entityLinks || []) {
            const newSourceId = getNewEntityId(linkData.sourceType, linkData.sourceId);
            const newTargetId = getNewEntityId(linkData.targetType, linkData.targetId);

            // Only create the link if both source and target entities were restored
            if (newSourceId && newTargetId) {
              await tx.entityLink.create({
                data: {
                  tripId: trip.id,
                  sourceType: linkData.sourceType,
                  sourceId: newSourceId,
                  targetType: linkData.targetType,
                  targetId: newTargetId,
                  relationship: linkData.relationship,
                  sortOrder: linkData.sortOrder,
                  notes: linkData.notes,
                },
              });
            }
          }

          // Import trip languages (added in v1.1.0)
          if (tripData.tripLanguages) {
            for (const langData of tripData.tripLanguages) {
              await tx.tripLanguage.create({
                data: {
                  tripId: trip.id,
                  languageCode: langData.languageCode,
                  language: langData.language,
                },
              });
              stats.tripLanguagesImported++;
            }
          }
        }
      },
      {
        maxWait: 60000, // 60 seconds
        timeout: 600000, // 10 minutes (large dataset restores need more time)
      }
    );

    return {
      success: true,
      message: 'Data restored successfully',
      stats,
    };
  } catch (error) {
    console.error('Error restoring from backup:', error);
    throw new AppError('Failed to restore from backup: ' + (error as Error).message, 500);
  }
}

/**
 * Clear all user data (for restore with clearExistingData option)
 */
async function clearUserData(userId: number, tx: Prisma.TransactionClient) {
  // Delete all trips (cascades to most related entities including tripLanguages)
  await tx.trip.deleteMany({
    where: { userId },
  });

  // Delete trip series
  await tx.tripSeries.deleteMany({
    where: { userId },
  });

  // Delete tags
  await tx.tripTag.deleteMany({
    where: { userId },
  });

  // Delete companions
  await tx.travelCompanion.deleteMany({
    where: { userId },
  });

  // Delete custom location categories
  await tx.locationCategory.deleteMany({
    where: { userId },
  });

  // Delete global checklists
  await tx.checklist.deleteMany({
    where: {
      userId,
      tripId: null,
    },
  });

  // Delete travel documents (added in v1.1.0)
  await tx.travelDocument.deleteMany({
    where: { userId },
  });
}

export default {
  restoreFromBackup,
};
