import Icon from '../ui/Icon';
import type { TimelineItem, TransportationType } from './types';

interface IconProps {
  className?: string;
}

// Activity icon
export function ActivityIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="activity" className={className} />;
}

// Journal icon
export function JournalIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="journal" className={className} />;
}

// Lodging icon
export function LodgingIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="lodging" className={className} />;
}

// Transportation icons by type
export function FlightIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="flight" className={className} />;
}

export function TrainIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="train" className={className} />;
}

export function BusIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="bus" className={className} />;
}

export function CarIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="car" className={className} />;
}

export function FerryIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="ferry" className={className} />;
}

export function BicycleIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="bike" className={className} />;
}

export function WalkIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="walk" className={className} />;
}

export function OtherTransportIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="place" className={className} />;
}

// Get transportation icon based on type
// eslint-disable-next-line react-refresh/only-export-components
export function getTransportationIcon(type: TransportationType, className = 'w-5 h-5') {
  switch (type) {
    case 'flight':
      return <FlightIcon className={className} />;
    case 'train':
      return <TrainIcon className={className} />;
    case 'bus':
      return <BusIcon className={className} />;
    case 'car':
      return <CarIcon className={className} />;
    case 'ferry':
      return <FerryIcon className={className} />;
    case 'bicycle':
      return <BicycleIcon className={className} />;
    case 'walk':
      return <WalkIcon className={className} />;
    default:
      return <OtherTransportIcon className={className} />;
  }
}

// Bookmark/pin, matching the 📌 used for CUSTOM_ITEM in entityConfig
export function CustomItemIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="custom" className={className} />;
}

// Get icon for any timeline item
// eslint-disable-next-line react-refresh/only-export-components
export function getTimelineItemIcon(item: TimelineItem, className = 'w-5 h-5') {
  switch (item.type) {
    case 'activity':
      return <ActivityIcon className={className} />;
    case 'transportation':
      return getTransportationIcon(item.transportationType || 'other', className);
    case 'lodging':
      return <LodgingIcon className={className} />;
    case 'journal':
      return <JournalIcon className={className} />;
    case 'customItem':
      return <CustomItemIcon className={className} />;
    default:
      return <ActivityIcon className={className} />;
  }
}

// Common UI icons
export function EditIcon({ className = 'w-4 h-4' }: IconProps) {
  return <Icon name="edit" className={className} />;
}

export function DeleteIcon({ className = 'w-4 h-4' }: IconProps) {
  return <Icon name="delete" className={className} />;
}

export function LinkIcon({ className = 'w-4 h-4' }: IconProps) {
  return <Icon name="link" className={className} />;
}

export function ChevronDownIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="expand" className={className} />;
}

export function ChevronUpIcon({ className = 'w-5 h-5' }: IconProps) {
  return <Icon name="collapse" className={className} />;
}

export function LocationIcon({ className = 'w-4 h-4' }: IconProps) {
  return <Icon name="place" className={className} />;
}

export function HashIcon({ className = 'w-3 h-3' }: IconProps) {
  return <Icon name="hash" className={className} />;
}

export function CheckCircleIcon({ className = 'w-3 h-3' }: IconProps) {
  return <Icon name="success" className={className} />;
}

export function PhotoIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return <Icon name="photo" className={className} />;
}

export function MoonIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return <Icon name="nightClear" className={className} />;
}

export function BoltIcon({ className = 'w-3.5 h-3.5' }: IconProps) {
  return <Icon name="bolt" className={className} />;
}

export function ChecklistIcon({ className = 'w-4 h-4' }: IconProps) {
  return <Icon name="checklist" className={className} />;
}
