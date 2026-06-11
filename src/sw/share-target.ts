import { SHARE_IMPORT_CACHE } from '../lib/share-import'

export async function handleShareTargetPost(request: Request): Promise<Response> {
  const form = await request.formData()
  const cache = await caches.open(SHARE_IMPORT_CACHE)

  const files = [
    ...form.getAll('files'),
    ...form.getAll('file'),
    ...form.getAll('audio'),
  ].filter((entry): entry is File => entry instanceof File)

  for (const file of files) {
    const headers = new Headers()
    headers.set('content-type', file.type || 'audio/mp4')
    headers.set('x-filename', file.name || 'shared-audio.m4a')
    await cache.put(
      `/share-import/${encodeURIComponent(file.name || 'shared-audio.m4a')}`,
      new Response(file, { headers }),
    )
  }

  return Response.redirect('/app?share=ready', 303)
}
