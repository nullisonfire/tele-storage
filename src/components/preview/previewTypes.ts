export type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'code'
  | 'spreadsheet'
  | 'docx'
  | 'pptx'
  | 'generic_document';

export function getFilePreviewKind(name: string, mediaType: string, mimeType?: string): PreviewKind {
  const ext = name.toLowerCase().split('.').pop() || '';

  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext) || mediaType === 'image') {
    return 'image';
  }
  if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp'].includes(ext) || mediaType === 'video') {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'].includes(ext) || mediaType === 'audio') {
    return 'audio';
  }
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) {
    return 'spreadsheet';
  }
  if (['docx', 'doc'].includes(ext)) {
    return 'docx';
  }
  if (['pptx', 'ppt', 'odp'].includes(ext)) {
    return 'pptx';
  }
  if (
    [
      'html', 'htm', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'scss',
      'py', 'php', 'json', 'xml', 'yaml', 'yml', 'sh', 'bash', 'sql',
      'c', 'cpp', 'h', 'hpp', 'java', 'rs', 'go', 'rb', 'lua', 'md', 'txt',
      'log', 'env', 'ini', 'conf', 'dockerfile', 'toml'
    ].includes(ext) ||
    (mimeType && (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('xml')))
  ) {
    return 'code';
  }

  return 'generic_document';
}
