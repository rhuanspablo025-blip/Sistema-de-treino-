import './globals.css';
import './workout-plans.css';
import './finance.css';
import './atlasfit-theme.css';
import './studio.css';
import './brand-refinement.css';
import './theme-modes.css';

export const metadata = {
  title: 'Atlas Training | Gestão de treinos',
  description: 'Gestão de fichas de treino para sua academia.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('atlasfit-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}" }} /></head>
      <body>{children}</body>
    </html>
  );
}
