export function getFileExtension(path) {
  const parts = path.split('.')
  return parts.length > 1 ? '.' + parts.pop() : ''
}
