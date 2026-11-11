/**
 * The generic create/edit form, driven by `ENTITY_FORMS`.
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import type { LocationDto } from '@travel-life/shared';
import {
  dayKeyInTimezone,
  formatDateOnly,
  formatTimeInTimezone,
  getTimezoneAbbreviation,
  msOfDayInTimezone,
  wallClockToInstant,
} from '@travel-life/shared';
import type { FormField } from '../lib/entityForms';
import { radius, spacing, TOUCH_TARGET, usePalette } from '../lib/theme';
import { AppText, Button, Chip, Field, Row } from './ui';

type Values = Record<string, unknown>;

interface EntityFormProps {
  fields: readonly FormField[];
  values: Values;
  errors: Readonly<Record<string, string>>;
  onChange: (key: string, value: unknown) => void;
  /** Zone used for date-time fields whose own timezone field is empty. */
  fallbackTimezone: string;
  /** Saved locations, for `location` fields. */
  locations: readonly LocationDto[];
}

/**
 * A Date whose *device-local* clock reads the same as the instant's wall clock
 * in `timezone`. The native pickers only know the device zone, so times are
 * shown and edited through this proxy and converted back on change.
 */
function toPickerDate(iso: string, timezone: string): Date {
  const [y, m, d] = dayKeyInTimezone(iso, timezone).split('-').map(Number);
  const ms = msOfDayInTimezone(iso, timezone);
  return new Date(y, m - 1, d, Math.floor(ms / 3600000), Math.floor((ms % 3600000) / 60000));
}

function fromPickerDate(picked: Date, timezone: string): string {
  const dayKey = [
    picked.getFullYear(),
    String(picked.getMonth() + 1).padStart(2, '0'),
    String(picked.getDate()).padStart(2, '0'),
  ].join('-');
  const msOfDay = picked.getHours() * 3600000 + picked.getMinutes() * 60000;
  return wallClockToInstant(dayKey, msOfDay, timezone).toISOString();
}

interface DateTimeFieldProps {
  label: string;
  value: string | null;
  mode: 'datetime' | 'date';
  timezone: string;
  error?: string;
  onChange: (value: string | null) => void;
}

function DateTimeField({ label, value, mode, timezone, error, onChange }: DateTimeFieldProps) {
  const palette = usePalette();
  const [iosOpen, setIosOpen] = useState(false);

  // Date-only values are calendar dates pinned to UTC midnight.
  const zone = mode === 'date' ? 'UTC' : timezone;
  const display = !value
    ? 'Not set'
    : mode === 'date'
      ? formatDateOnly(value)
      : `${formatDateOnly(`${dayKeyInTimezone(value, zone)}T00:00:00Z`)} · ${formatTimeInTimezone(
          value,
          zone
        )} ${getTimezoneAbbreviation(zone, new Date(value))}`;

  const emit = (picked: Date) => {
    if (mode === 'date') {
      const key = [
        picked.getFullYear(),
        String(picked.getMonth() + 1).padStart(2, '0'),
        String(picked.getDate()).padStart(2, '0'),
      ].join('-');
      onChange(`${key}T00:00:00.000Z`);
    } else {
      onChange(fromPickerDate(picked, zone));
    }
  };

  const current = value ? toPickerDate(value, zone) : new Date();

  const open = () => {
    if (Platform.OS !== 'android') {
      setIosOpen((prev) => !prev);
      return;
    }
    // Android has no combined picker: date first, then time.
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        if (mode === 'date') {
          emit(date);
          return;
        }
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: true,
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return;
            const merged = new Date(date);
            merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
            emit(merged);
          },
        });
      },
    });
  };

  return (
    <View style={styles.block}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      <Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${display}`}
          onPress={open}
          style={[
            styles.picker,
            { borderColor: error ? palette.danger : palette.border, backgroundColor: palette.surface },
          ]}>
          <AppText>{display}</AppText>
        </Pressable>
        {value ? <Button label="Clear" variant="ghost" compact onPress={() => onChange(null)} /> : null}
      </Row>
      {Platform.OS !== 'android' && iosOpen ? (
        <DateTimePicker
          value={current}
          mode={mode}
          display="inline"
          onChange={(_event, date) => {
            if (date) emit(date);
          }}
        />
      ) : null}
      {error ? (
        <AppText variant="caption" color={palette.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const asText = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

export default function EntityForm({
  fields,
  values,
  errors,
  onChange,
  fallbackTimezone,
  locations,
}: EntityFormProps) {
  const palette = usePalette();
  // Raw text of number inputs, so "12." is not eaten while typing.
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});

  return (
    <View style={styles.form}>
      {fields.map((field) => {
        const value = values[field.key];
        const error = errors[field.key];

        switch (field.type) {
          case 'boolean':
            return (
              <Row key={field.key} style={styles.switchRow}>
                <AppText>{field.label}</AppText>
                <Switch
                  accessibilityLabel={field.label}
                  value={Boolean(value)}
                  onValueChange={(next) => onChange(field.key, next)}
                  trackColor={{ true: palette.primary, false: palette.border }}
                />
              </Row>
            );

          case 'select':
            return (
              <View key={field.key} style={styles.block}>
                <AppText variant="label" muted>
                  {field.label}
                </AppText>
                <Row>
                  {(field.options ?? []).map((option) => (
                    <Chip
                      key={option}
                      label={option.replace(/_/g, ' ')}
                      selected={value === option}
                      onPress={() => onChange(field.key, option)}
                    />
                  ))}
                </Row>
                {error ? (
                  <AppText variant="caption" color={palette.danger}>
                    {error}
                  </AppText>
                ) : null}
              </View>
            );

          case 'rating':
            return (
              <View key={field.key} style={styles.block}>
                <AppText variant="label" muted>
                  {field.label}
                </AppText>
                <Row>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Pressable
                      key={star}
                      accessibilityRole="button"
                      accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
                      accessibilityState={{ selected: Number(value) >= star }}
                      onPress={() => onChange(field.key, star)}
                      style={styles.star}>
                      <AppText
                        variant="title"
                        color={Number(value) >= star ? palette.accent : palette.border}>
                        ★
                      </AppText>
                    </Pressable>
                  ))}
                </Row>
              </View>
            );

          case 'datetime':
          case 'date': {
            const own = field.timezoneKey ? values[field.timezoneKey] : null;
            return (
              <DateTimeField
                key={field.key}
                label={field.label}
                mode={field.type}
                value={typeof value === 'string' && value ? value : null}
                timezone={typeof own === 'string' && own ? own : fallbackTimezone}
                error={error}
                onChange={(next) => onChange(field.key, next)}
              />
            );
          }

          case 'location':
            return (
              <View key={field.key} style={styles.block}>
                <AppText variant="label" muted>
                  {field.label}
                </AppText>
                <Row>
                  <Chip
                    label="None"
                    selected={value === null || value === undefined}
                    onPress={() => onChange(field.key, null)}
                  />
                  {locations.map((location) => (
                    <Chip
                      key={String(location.id)}
                      label={location.name}
                      selected={String(value) === String(location.id)}
                      onPress={() => onChange(field.key, location.id)}
                    />
                  ))}
                </Row>
              </View>
            );

          case 'number':
            return (
              <Field
                key={field.key}
                label={field.label}
                error={error}
                keyboardType="decimal-pad"
                placeholder={field.placeholder}
                value={numberDrafts[field.key] ?? asText(value)}
                onChangeText={(text) => {
                  setNumberDrafts((prev) => ({ ...prev, [field.key]: text }));
                  const normalized = text.replace(',', '.').trim();
                  if (normalized === '') onChange(field.key, null);
                  else if (Number.isFinite(Number(normalized))) onChange(field.key, Number(normalized));
                }}
              />
            );

          default:
            return (
              <Field
                key={field.key}
                label={field.label}
                error={error}
                placeholder={field.placeholder}
                multiline={field.type === 'multiline'}
                autoCapitalize={field.type === 'url' ? 'none' : 'sentences'}
                autoCorrect={field.type !== 'url'}
                keyboardType={field.type === 'url' ? 'url' : 'default'}
                value={asText(value)}
                // An emptied optional field is stored as null, which the update
                // endpoints read as "clear it".
                onChangeText={(text) => onChange(field.key, text === '' ? null : text)}
              />
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  block: { gap: spacing.xs },
  switchRow: { justifyContent: 'space-between', minHeight: TOUCH_TARGET },
  picker: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  star: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
