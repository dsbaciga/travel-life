import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { collaborationController } from '../controllers/collaboration.controller';

const router = Router();

// ============================================================
// Public routes (no authentication required)
// ============================================================

/**
 * @openapi
 * /api/collaboration/invitations/token/{token}:
 *   get:
 *     summary: Get invitation details by token
 *     description: Used for invite links - does not require authentication
 *     tags: [Collaboration]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The invitation token
 *     responses:
 *       200:
 *         description: Invitation details
 *       404:
 *         description: Invitation not found or expired
 */
router.get('/invitations/token/:token', collaborationController.getInvitationByToken);

// ============================================================
// All routes below require authentication
// ============================================================
// Applied per route, NOT with router.use(). This router is mounted at the bare
// /api prefix, so a path-less router.use(authenticate) runs for every /api
// request that reaches it, including ones meant for routers mounted later:
// the public share links, the calendar feed and invitation acceptance all
// answered 401 'Sign in to continue.' because of it.

// ============================================================
// User Invitations (for the logged-in user)
// ============================================================

/**
 * @openapi
 * /api/collaboration/invitations:
 *   get:
 *     summary: Get pending invitations for the current user
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending invitations
 *       401:
 *         description: Unauthorized
 */
router.get('/invitations', authenticate, collaborationController.getMyInvitations);

/**
 * @openapi
 * /api/collaboration/invitations/{invitationId}/accept:
 *   post:
 *     summary: Accept an invitation
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The invitation ID
 *     responses:
 *       200:
 *         description: Invitation accepted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invitation not found
 */
router.post('/invitations/:invitationId/accept', authenticate, collaborationController.acceptInvitation);

/**
 * @openapi
 * /api/collaboration/invitations/{invitationId}/decline:
 *   post:
 *     summary: Decline an invitation
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The invitation ID
 *     responses:
 *       200:
 *         description: Invitation declined successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invitation not found
 */
router.post('/invitations/:invitationId/decline', authenticate, collaborationController.declineInvitation);

// ============================================================
// Shared Trips
// ============================================================

/**
 * @openapi
 * /api/collaboration/trips/shared:
 *   get:
 *     summary: Get trips shared with the current user
 *     description: Returns trips where the user is a collaborator (not owner)
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of shared trips
 *       401:
 *         description: Unauthorized
 */
router.get('/trips/shared', authenticate, collaborationController.getSharedTrips);

// ============================================================
// Trip-specific collaboration management
// ============================================================

/**
 * @openapi
 * /api/collaboration/trips/{tripId}/permission:
 *   get:
 *     summary: Get user's permission level for a trip
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     responses:
 *       200:
 *         description: Permission level (owner, admin, edit, view)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found
 */
router.get('/trips/:tripId/permission', authenticate, collaborationController.getPermissionLevel);

/**
 * @openapi
 * /api/collaboration/trips/{tripId}/collaborators:
 *   get:
 *     summary: Get all collaborators for a trip
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     responses:
 *       200:
 *         description: List of collaborators with their permission levels
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not authorized to view collaborators
 *       404:
 *         description: Trip not found
 */
router.get('/trips/:tripId/collaborators', authenticate, collaborationController.getCollaborators);

/**
 * @openapi
 * /api/collaboration/trips/{tripId}/collaborators/{userId}:
 *   patch:
 *     summary: Update a collaborator's permission level
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The collaborator's user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [permissionLevel]
 *             properties:
 *               permissionLevel:
 *                 type: string
 *                 enum: [view, edit, admin]
 *     responses:
 *       200:
 *         description: Collaborator updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not authorized to update collaborators
 *       404:
 *         description: Trip or collaborator not found
 *   delete:
 *     summary: Remove a collaborator from a trip
 *     description: Can also be used to leave a trip (when userId is the current user)
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The collaborator's user ID
 *     responses:
 *       200:
 *         description: Collaborator removed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not authorized to remove collaborators
 *       404:
 *         description: Trip or collaborator not found
 */
router.patch('/trips/:tripId/collaborators/:userId', authenticate, collaborationController.updateCollaborator);
router.delete('/trips/:tripId/collaborators/:userId', authenticate, collaborationController.removeCollaborator);

// ============================================================
// Trip Invitations (for trip owners/admins)
// ============================================================

/**
 * @openapi
 * /api/collaboration/trips/{tripId}/invitations:
 *   get:
 *     summary: Get pending invitations for a trip
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     responses:
 *       200:
 *         description: List of pending invitations for the trip
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not authorized to view invitations
 *       404:
 *         description: Trip not found
 *   post:
 *     summary: Send an invitation to collaborate on a trip
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *               permissionLevel:
 *                 type: string
 *                 enum: [view, edit, admin]
 *                 default: view
 *               message:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       201:
 *         description: Invitation sent successfully
 *       400:
 *         description: Validation error or user already invited
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not authorized to send invitations
 *       404:
 *         description: Trip not found
 */
router.get('/trips/:tripId/invitations', authenticate, collaborationController.getTripInvitations);
router.post('/trips/:tripId/invitations', authenticate, collaborationController.sendInvitation);

/**
 * @openapi
 * /api/collaboration/trips/{tripId}/invitations/{invitationId}:
 *   delete:
 *     summary: Cancel a pending invitation
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The invitation ID
 *     responses:
 *       200:
 *         description: Invitation cancelled successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not authorized to cancel invitations
 *       404:
 *         description: Trip or invitation not found
 */
router.delete('/trips/:tripId/invitations/:invitationId', authenticate, collaborationController.cancelInvitation);

/**
 * @openapi
 * /api/collaboration/trips/{tripId}/invitations/{invitationId}/resend:
 *   post:
 *     summary: Resend a pending invitation
 *     tags: [Collaboration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The invitation ID
 *     responses:
 *       200:
 *         description: Invitation resent successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not authorized to resend invitations
 *       404:
 *         description: Trip or invitation not found
 */
router.post('/trips/:tripId/invitations/:invitationId/resend', authenticate, collaborationController.resendInvitation);

export default router;
