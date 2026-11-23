import Icon from './ui/Icon';

interface Props {
  originalName: string;
  storedPath: string;
}

export default function SourcePdfBadge({ originalName, storedPath }: Props) {
  // storedPath is relative, e.g. "pdfs/123/uuid.pdf" — prefix with configured upload base URL
  const uploadBase = import.meta.env.VITE_UPLOAD_URL || '/uploads';
  const url = `${uploadBase}/${storedPath}`;
  const displayName = originalName.length > 30 ? `${originalName.slice(0, 27)}...` : originalName;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={originalName}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="pdf" size={12} />
      {displayName}
    </a>
  );
}
