import './globals.css';
import './workout-plans.css';
import './finance.css';
import './atlasfit-theme.css';
import './studio.css';
import './brand-refinement.css';
import './theme-modes.css';
import './muscle-anatomy.css';

const title = 'AtlasFit | Sistema de Gestão de Academias e Treinos';
const description = 'Plataforma para academias e personal trainers. Gerencie alunos, fichas de treino, exercícios e acompanhamento físico em um único sistema.';

export const metadata = {
  metadataBase: new URL('https://www.atlasfit.com.br'),
  title,
  description,
  applicationName: 'AtlasFit',
  icons: { icon: [{ url: '/brand/atlasfit-symbol.jpeg', type: 'image/jpeg' }], apple: '/brand/atlasfit-symbol.jpeg' },
  openGraph: { type: 'website', locale: 'pt_BR', siteName: 'AtlasFit', title, description,
    images: [{ url: '/brand/atlasfit-logo-horizontal.jpeg', alt: 'Logo oficial AtlasFit' }] },
  twitter: { card: 'summary_large_image', title, description, images: ['/brand/atlasfit-logo-horizontal.jpeg'] },
  robots: { googleBot: { 'max-image-preview': 'large' } },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('atlasfit-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}" }} /></head>
      <body>{children}</body>
    </html>
  );
}
