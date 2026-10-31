import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/api-auth';

export const runtime = 'nodejs';

const WGER_API = 'https://wger.de/api/v2';
const safeText = (value, limit = 500) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
};
const cleanDescription = (value) => safeText(String(value || '')
  .replace(/<br\\s*\\/?\\s*>/gi, '\\n')
  .replace(/<\\/p>/gi, '\\n')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\\s+/g, ' '), 2000);

async function wgerRequest(path) {
  const response = await fetch(`${WGER_API}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Catálogo externo respondeu HTTP ${response.status}.`);
  return response.json();
}

export async function GET(request) {
  const access = await requireStaff();
  if (access.response) return access.response;

  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  const term = safeText(params.get('term'), 80);

  try {
    if (id) {
      if (!/^\\d{1,8}$/.test(id)) return NextResponse.json({ error: 'Identificador externo inválido.' }, { status: 400 });
      const data = await wgerRequest(`/exerciseinfo/${id}/`);
      const translations = Array.isArray(data.translations) ? data.translations : [];
      const translation = translations.find((item) => item.language === 2) || translations.find((item) => item.name) || {};
      const images = Array.isArray(data.images) ? data.images : [];
      const videos = Array.isArray(data.videos) ? data.videos : [];
      const image = images.find((item) => item.is_main) || images[0] || {};
      const video = videos[0] || {};
      const imageLicense = image.license_title || image.license?.full_name || image.license?.short_name || '';
      const attribution = [image.license_author, imageLicense].filter(Boolean).join(' · ');
      return NextResponse.json({
        exercise: {
          id: data.id,
          name: safeText(translation.name, 120),
          category: safeText(data.category?.name, 100),
          primaryMuscles: (data.muscles || []).map((muscle) => safeText(muscle.name_en || muscle.name, 60)).filter(Boolean),
          secondaryMuscles: (data.muscles_secondary || []).map((muscle) => safeText(muscle.name_en || muscle.name, 60)).filter(Boolean),
          equipment: (data.equipment || []).map((item) => safeText(item.name, 60)).filter(Boolean).join(', '),
          instructions: cleanDescription(translation.description),
          imageUrl: safeUrl(image.image),
          videoUrl: safeUrl(video.video),
          mediaAttribution: safeText(attribution, 500),
          mediaSourceUrl: safeUrl(image.license_object_url) || `https://wger.de/en/exercise/${data.id}`,
        },
      });
    }

    if (term.length < 2) return NextResponse.json({ error: 'Digite pelo menos 2 caracteres para pesquisar.' }, { status: 400 });
    const data = await wgerRequest(`/exercise/search/?term=${encodeURIComponent(term)}&language=english`);
    const results = (Array.isArray(data.suggestions) ? data.suggestions : [])
      .map((suggestion) => suggestion.data || suggestion)
      .filter((item) => Number.isInteger(Number(item.id)) && safeText(item.name, 120))
      .slice(0, 10)
      .map((item) => ({ id: Number(item.id), name: safeText(item.name, 120), category: safeText(item.category, 80) }));
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.name === 'TimeoutError' ? 'O catálogo externo demorou para responder. Tente novamente.' : error.message || 'Não foi possível consultar o catálogo externo.' }, { status: 502 });
  }
}
