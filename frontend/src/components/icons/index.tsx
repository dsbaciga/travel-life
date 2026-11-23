/**
 * Named wrappers around the shared `<Icon>` (Material Symbols). They keep the
 * old per-glyph components working for existing call sites; new code should use
 * `<Icon name="..." />` from `components/ui/Icon` directly.
 */
import Icon from '../ui/Icon';

interface IconProps {
  className?: string;
}

export function CloseIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="close" className={className} />;
}

export function SearchIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="search" className={className} />;
}

export function FilterIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="filter" className={className} />;
}

export function PlusIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="add" className={className} />;
}

export function TrashIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="delete" className={className} />;
}

export function ChevronRightIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="chevronRight" className={className} />;
}

export function ChevronDownIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="expand" className={className} />;
}

export function PhotoIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="photo" className={className} />;
}

export function EditIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="edit" className={className} />;
}

export function MapPinIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="place" className={className} />;
}

export function CalendarIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="calendar" className={className} />;
}

export function ChevronUpIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="collapse" className={className} />;
}

export function EllipsisVerticalIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="moreVertical" className={className} />;
}

export function PencilIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="edit" className={className} />;
}

export function CameraIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="camera" className={className} />;
}

export function ListIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="list" className={className} />;
}

/** Spinner/loading icon (spins). */
export function SpinnerIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="spinner" className={`animate-spin ${className}`} />;
}
