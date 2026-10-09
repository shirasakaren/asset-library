'use client';

import { Suspense } from 'react';
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
  // `WizardProvider` reads `?version=` (`useSearchParams`), which static export wants under Suspense.
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" />}>
      <WizardProvider initialAsset={initialAsset} locale={locale}>
        <AnalyzerBridge />
        <WizardHeader />
        <Container size="2xl">
          <div className="grid grid-cols-1 gap-10 pb-24 pt-8 lg:grid-cols-[260px_1fr]">
            <StepRail />
            <div>
              <StepContent />
            </div>
          </div>
        </Container>
      </WizardProvider>
    </Suspense>
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
