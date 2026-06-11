export function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}
