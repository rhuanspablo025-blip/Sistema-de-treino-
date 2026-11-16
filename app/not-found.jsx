import Image from 'next/image';
import Link from 'next/link';
import atlasfitLogo from '../public/brand/atlasfit-logo-horizontal.jpeg';

export default function NotFound() {
  return (
    <main className="not-found-page">
      <Image src={atlasfitLogo} alt="AtlasFit" priority />
      <p className="eyebrow">PÁGINA NÃO ENCONTRADA</p>
      <h1>Esse caminho não existe.</h1>
      <p>Confira o endereço ou volte para a área inicial do AtlasFit.</p>
      <Link href="/login" className="primary-button">Voltar ao início</Link>
    </main>
  );
}
