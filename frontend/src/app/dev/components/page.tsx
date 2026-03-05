import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { CodeBlock } from '@/components/ui/code-block';
import { EmptyState } from '@/components/ui/empty-state';
import { GeometricPattern } from '@/components/brand/geometric-pattern';
import { Avatar } from '@/components/ui/avatar';
import { FooterStrip } from '@/components/brand/footer-strip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, Radio } from '@/components/ui/radio';
import { Switch } from '@/components/ui/switch';
import { Search, Plus, Download, Trash2 } from 'lucide-react';

export const metadata = { title: 'Components' };

export default function ComponentsPlaygroundPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Container size="xl">
      <div className="py-12">
        <Breadcrumbs items={[{ label: 'Dev', href: '/dev' }, { label: 'Components' }]} />
        <div className="mt-4 mb-12">
          <h1 className="display-lg text-ink">Component playground</h1>
          <p className="mt-2 text-body text-ink-2 max-w-prose">
            Every primitive in the design system. Available outside production only.
          </p>
        </div>

        {/* Section: Buttons */}
        <Section title="Buttons" eyebrow="01">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button iconOnly aria-label="Add">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
            </Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button leadingIcon={<Download className="h-4 w-4" strokeWidth={2.25} />}>
              Download
            </Button>
            <Button variant="danger" leadingIcon={<Trash2 className="h-4 w-4" strokeWidth={2.25} />}>
              Delete
            </Button>
          </div>
        </Section>

        {/* Section: Forms */}
        <Section title="Inputs" eyebrow="02">
          <div className="grid md:grid-cols-2 gap-6 max-w-[720px]">
            <Field id="email" label="Email" helper="We'll only use this for sign-in." required>
              <Input id="email" type="email" placeholder="you@labmgm.org" />
            </Field>
            <Field id="search" label="Search">
              <Input
                id="search"
                placeholder="Find an asset"
                leadingIcon={<Search className="h-4 w-4" strokeWidth={2.25} />}
              />
            </Field>
            <Field id="err" label="With error" error="Please enter a valid email.">
              <Input id="err" invalid defaultValue="not-an-email" />
            </Field>
            <Field id="bio" label="Bio">
              <Textarea id="bio" placeholder="A short bio…" />
            </Field>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <label className="inline-flex items-center gap-2 text-body-sm text-ink">
              <Checkbox /> Email me about updates
            </label>
            <label className="inline-flex items-center gap-2 text-body-sm text-ink">
              <Checkbox checked /> Auto-sync versions
            </label>
            <label className="inline-flex items-center gap-2 text-body-sm text-ink">
              <Switch defaultChecked /> Plugin access
            </label>
          </div>
          <RadioGroup defaultValue="unity" className="mt-6 grid grid-cols-3 gap-3 max-w-[480px]">
            <label className="flex items-center gap-2 border border-line rounded-[12px] p-3 cursor-pointer hover:border-ink/40 transition-colors">
              <Radio value="unity" /> Unity
            </label>
            <label className="flex items-center gap-2 border border-line rounded-[12px] p-3 cursor-pointer hover:border-ink/40 transition-colors">
              <Radio value="unreal" /> Unreal
            </label>
            <label className="flex items-center gap-2 border border-line rounded-[12px] p-3 cursor-pointer hover:border-ink/40 transition-colors">
              <Radio value="agnostic" /> Agnostic
            </label>
          </RadioGroup>
        </Section>

        {/* Section: Cards */}
        <Section title="Cards" eyebrow="03">
          <div className="grid md:grid-cols-3 gap-4">
            <Card variant="outlined">
              <CardHeader>
                <CardTitle>Outlined</CardTitle>
                <Badge variant="success">Live</Badge>
              </CardHeader>
              <CardDescription>Default card variant. Hover lifts the surface.</CardDescription>
              <CardContent className="mt-3">Content goes here.</CardContent>
            </Card>
            <Card variant="tinted">
              <CardTitle>Tinted</CardTitle>
              <CardDescription>Subtle off-white zoning.</CardDescription>
            </Card>
            <Card variant="inverse">
              <CardTitle className="text-white">Inverse</CardTitle>
              <p className="text-body-sm text-white/70 mt-2">
                Reserved for high-contrast breaks.
              </p>
            </Card>
          </div>
        </Section>

        {/* Section: Badges */}
        <Section title="Badges" eyebrow="04">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="success">Published</Badge>
            <Badge variant="warning">Pending</Badge>
            <Badge variant="danger">Infected</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="solid">Solid</Badge>
          </div>
        </Section>

        {/* Section: Alerts */}
        <Section title="Alerts" eyebrow="05">
          <div className="grid gap-3 max-w-[640px]">
            <Alert title="Heads up" variant="info">
              A new version of this asset is available.
            </Alert>
            <Alert title="Saved" variant="success">
              Your draft was saved at 3:24 PM.
            </Alert>
            <Alert title="Slow upload" variant="warning">
              This file is bigger than 100MB — multipart upload recommended.
            </Alert>
            <Alert title="Upload failed" variant="danger">
              The file couldn't be uploaded. Please retry.
            </Alert>
          </div>
        </Section>

        {/* Section: Loading */}
        <Section title="Loading" eyebrow="06">
          <div className="flex items-center gap-4">
            <Spinner size={16} />
            <Spinner size={20} />
            <Spinner size={24} />
          </div>
          <div className="mt-6 grid md:grid-cols-2 gap-6 max-w-[640px]">
            <div>
              <Skeleton className="h-32 w-full mb-3" />
              <SkeletonText lines={3} />
            </div>
            <div>
              <Skeleton className="h-32 w-full mb-3" />
              <SkeletonText lines={2} />
            </div>
          </div>
        </Section>

        {/* Section: Empty state */}
        <Section title="Empty state" eyebrow="07">
          <EmptyState
            title="Your library is empty"
            description="Save assets to your library to download them later or sync them through the Unity / Unreal plugin."
            seed="library-empty"
            primaryAction={<Button>Browse Discover</Button>}
            secondaryAction={<Button variant="ghost">Read the docs</Button>}
          />
        </Section>

        {/* Section: Tabs */}
        <Section title="Tabs" eyebrow="08">
          <Tabs defaultValue="overview" className="max-w-[640px]">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="versions">Versions</TabsTrigger>
              <TabsTrigger value="discussion">Discussion</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="text-body-sm text-ink-2">Overview content lives here.</p>
            </TabsContent>
            <TabsContent value="versions">
              <p className="text-body-sm text-ink-2">Versions land in Part 2.</p>
            </TabsContent>
            <TabsContent value="discussion">
              <p className="text-body-sm text-ink-2">Comments land in Part 3.</p>
            </TabsContent>
          </Tabs>
        </Section>

        {/* Section: CodeBlock */}
        <Section title="Code" eyebrow="09">
          <CodeBlock
            filename="package.json"
            language="json"
            code={`{
  "name": "mgm-asset-library-frontend",
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev"
  }
}`}
          />
        </Section>

        {/* Section: Brand */}
        <Section title="Brand" eyebrow="10">
          <div className="flex items-center gap-8 mb-6">
            <Avatar data={{ initials: 'ID', bgColor: '#3a6dc5', fgColor: '#ffffff' }} size={48} />
            <Avatar data={{ initials: 'MA', bgColor: '#f7bf33', fgColor: '#0e1116' }} size={48} />
            <Avatar data={{ initials: 'RB', bgColor: '#f94141', fgColor: '#ffffff' }} size={48} />
            <Avatar data={{ initials: 'GN', bgColor: '#0f8657', fgColor: '#ffffff' }} size={48} />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border border-line rounded-[16px] overflow-hidden">
              <GeometricPattern variant="corner" seed="brand-1" size={56} />
            </div>
            <div className="border border-line rounded-[16px] overflow-hidden">
              <GeometricPattern variant="square" seed="brand-2" size={56} />
            </div>
            <div className="border border-line rounded-[16px] overflow-hidden">
              <GeometricPattern variant="banner" seed="brand-3" size={56} rows={2} cols={3} />
            </div>
          </div>
          <div className="mt-6">
            <FooterStrip />
          </div>
        </Section>
      </div>
    </Container>
  );
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-10 border-t border-line first:border-t-0 first:pt-0">
      <div className="mb-6 flex items-baseline gap-4">
        <span className="text-eyebrow uppercase tracking-[0.12em] text-ink-3 geist-tnum">
          {eyebrow}
        </span>
        <h2 className="font-display text-h1 text-ink tracking-[-0.015em]">{title}</h2>
      </div>
      {children}
    </section>
  );
}
