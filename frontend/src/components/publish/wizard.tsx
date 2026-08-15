'use client';

import { useLocale } from 'next-intl';
import { Container } from '@/components/layout/container';
import { WizardProvider, useWizard, type WizardStep } from './wizard-context';
import { WizardHeader } from './wizard-header';
import { StepRail } from './step-rail';
import { StepBasics } from './steps/step-basics';
import { StepMedia } from './steps/step-media';
import { StepFiles } from './steps/step-files';
import { StepDescription } from './steps/step-description';
import { StepCompatibility } from './steps/step-compatibility';
import { StepTags } from './steps/step-tags';
import { StepLicense } from './steps/step-license';
import { StepReview } from './steps/step-review';
import { AnalyzerBridge } from '@/lib/ws/analyzer-bridge';
import type { AssetDetail, LocaleCode } from '@/lib/api/types';

interface PublishWizardProps {
  initialAsset: AssetDetail;
}

export function PublishWizard({ initialAsset }: PublishWizardProps) {
  const locale = useLocale() as LocaleCode;
  return (
    <WizardProvider initialAsset={initialAsset} locale={locale}>
      <AnalyzerBridge />
      <WizardHeader />
      <Container size="2xl">
        <div className="pt-8 pb-24 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10">
          <StepRail />
          <div>
            <StepContent />
          </div>
        </div>
      </Container>
    </WizardProvider>
  );
}

function StepContent() {
  const wiz = useWizard();
  const map: Record<WizardStep, React.ComponentType> = {
    basics: StepBasics,
    media: StepMedia,
    files: StepFiles,
    description: StepDescription,
    compatibility: StepCompatibility,
    tags: StepTags,
    license: StepLicense,
    review: StepReview,
  };
  const Comp = map[wiz.step];
  return <Comp />;
}
