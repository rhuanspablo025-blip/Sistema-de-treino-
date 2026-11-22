import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../../lib/session';
import ForgeOpening from '../../components/forge/ForgeOpening';

export default async function LoginLayout({ children }) {
  const hasSessionCookie = (await cookies()).has(SESSION_COOKIE);
  return (
    <>
      {children}
      {!hasSessionCookie && <ForgeOpening />}
    </>
  );
}
