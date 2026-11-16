import { useId, useState } from "react";
import toast from "react-hot-toast";
import userService from "../../services/user.service";
import { useUpdateUser } from "../../store/authStore";
import { useUnits } from "../../hooks/useUnits";
import type { MeasurementSystem } from "../../utils/units";

const OPTIONS: Array<{ value: MeasurementSystem; label: string; hint: string }> = [
  { value: "imperial", label: "Imperial", hint: "Miles and °F" },
  { value: "metric", label: "Metric", hint: "Kilometers and °C" },
];

/**
 * Units: imperial or metric for the distances and temperatures the app shows. Saved as soon
 * as it is chosen (like the map style toggle) and written to the session so every screen
 * switches at once, without a reload.
 */
export default function UnitsSetting() {
  const { system } = useUnits();
  const updateUser = useUpdateUser();
  const [saving, setSaving] = useState(false);
  const groupId = useId();

  const choose = async (next: MeasurementSystem) => {
    if (next === system || saving) return;
    setSaving(true);
    try {
      await userService.updateSettings({ measurementSystem: next });
      updateUser({ measurementSystem: next });
      toast.success(next === "imperial" ? "Using imperial units" : "Using metric units");
    } catch {
      toast.error("Failed to save units");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
      <h2 id={groupId} className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Units
      </h2>
      <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
        How distances and temperatures are shown. Your trips are stored the same either way.
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="flex flex-wrap gap-3">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-center gap-3 min-h-[44px] px-4 rounded-lg border cursor-pointer ${
              system === option.value
                ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-dusk-600"
            }`}
          >
            <input
              type="radio"
              name="measurement-system"
              value={option.value}
              checked={system === option.value}
              disabled={saving}
              onChange={() => void choose(option.value)}
            />
            <span>
              <span className="block font-medium text-gray-900 dark:text-white">{option.label}</span>
              <span className="block text-sm text-gray-600 dark:text-dusk-400">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
