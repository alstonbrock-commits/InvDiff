import LegalScreen from '@/screens/LegalScreen';
import { PRIVACY_SECTIONS } from '@/fixtures/legal';

export default function PrivacyPolicy() {
  return <LegalScreen title="Privacy policy" sections={PRIVACY_SECTIONS} />;
}
