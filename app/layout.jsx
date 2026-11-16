import './globals.css';
import './workout-plans.css';
import './finance.css';
import './atlasfit-theme.css';

export const metadata = {
  title: 'Atlas Training | Gestão de treinos',
  description: 'Gestão de fichas de treino para sua academia.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
