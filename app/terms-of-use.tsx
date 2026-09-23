import LegalScreen from '@/screens/LegalScreen';
import { TERMS_SECTIONS } from '@/fixtures/legal';

export default function TermsOfUse() {
  return <LegalScreen title="Terms of use" sections={TERMS_SECTIONS} />;
}
