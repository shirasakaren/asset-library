/**
 * Static text pools and fixtures for the seed generator. Pure data, no logic and
 * no randomness: build-seed.ts decides which entry to use.
 */
import type { IssueStatus, LocaleCode } from '../../src/lib/api/types';
import type { ReportCategory } from '../../src/lib/api/admin-types';

export interface UserSeed {
  name: string;
  role: 'admin' | 'contributor' | 'user';
  locale: LocaleCode;
}

/** The 24 users after the persona, in file order. */
export const USER_SEEDS: UserSeed[] = [
  { name: 'Kenji Matsuda', role: 'admin', locale: 'en' },
  { name: 'Siti Rahmawati', role: 'admin', locale: 'id' },
  { name: 'Budi Santoso', role: 'contributor', locale: 'id' },
  { name: 'Dewi Lestari', role: 'contributor', locale: 'id' },
  { name: 'Agus Setiawan', role: 'contributor', locale: 'id' },
  { name: 'Ayu Puspitasari', role: 'contributor', locale: 'id' },
  { name: 'Rizky Ramadhan', role: 'contributor', locale: 'id' },
  { name: 'Haruka Tanaka', role: 'contributor', locale: 'en' },
  { name: 'Yuki Nakamura', role: 'contributor', locale: 'en' },
  { name: 'Mei Ishikawa', role: 'contributor', locale: 'en' },
  { name: 'Oliver Bennett', role: 'contributor', locale: 'en' },
  { name: 'Grace Holloway', role: 'contributor', locale: 'en' },
  { name: 'Marcus Reyes', role: 'contributor', locale: 'en' },
  { name: 'Priya Nair', role: 'contributor', locale: 'en' },
  { name: 'Daniel Okafor', role: 'contributor', locale: 'en' },
  { name: 'Chloe Martin', role: 'contributor', locale: 'en' },
  { name: 'Putri Anggraini', role: 'user', locale: 'id' },
  { name: 'Eko Wibowo', role: 'user', locale: 'id' },
  { name: 'Nadia Kusuma', role: 'user', locale: 'id' },
  { name: 'Fajar Nugroho', role: 'user', locale: 'id' },
  { name: 'Sora Hayashi', role: 'user', locale: 'en' },
  { name: 'Takumi Fujita', role: 'user', locale: 'en' },
  { name: 'Eleanor Whitfield', role: 'user', locale: 'en' },
  { name: 'Lucas Ferreira', role: 'user', locale: 'en' },
];

export const CATEGORY_SEEDS = [
  { slug: '3d-models', en: '3D Models', id: 'Model 3D', sortOrder: 10, icon: 'box' },
  { slug: '2d-art', en: '2D Art & Sprites', id: 'Seni 2D & Sprite', sortOrder: 20, icon: 'image' },
  { slug: 'audio', en: 'Audio & Music', id: 'Audio & Musik', sortOrder: 30, icon: 'music' },
  { slug: 'vfx', en: 'VFX & Particles', id: 'VFX & Partikel', sortOrder: 40, icon: 'sparkles' },
  { slug: 'animation', en: 'Animations', id: 'Animasi', sortOrder: 50, icon: 'film' },
  { slug: 'tools', en: 'Tools & Plugins', id: 'Alat & Plugin', sortOrder: 60, icon: 'wrench' },
  {
    slug: 'scripts',
    en: 'Scripts & Snippets',
    id: 'Skrip & Cuplikan',
    sortOrder: 70,
    icon: 'code',
  },
  {
    slug: 'templates',
    en: 'Project Templates',
    id: 'Template Proyek',
    sortOrder: 80,
    icon: 'layout-template',
  },
  {
    slug: 'shaders',
    en: 'Shaders & Materials',
    id: 'Shader & Material',
    sortOrder: 90,
    icon: 'palette',
  },
  {
    slug: 'documents',
    en: 'Documents & Guides',
    id: 'Dokumen & Panduan',
    sortOrder: 100,
    icon: 'book-open',
  },
] as const;

/** Same seven licenses as backend/scripts/seed.ts (full text included). */
export const LICENSE_SEEDS = [
  {
    slug: 'mit',
    name: 'MIT License',
    description: {
      en: 'Permissive license requiring attribution.',
      id: 'Lisensi permisif yang memerlukan atribusi.',
    },
    fullText: {
      en: 'MIT License — full text canonical at https://opensource.org/license/mit',
      id: '',
    },
    sortOrder: 10,
  },
  {
    slug: 'cc0',
    name: 'CC0 1.0 Universal',
    description: {
      en: 'No rights reserved — public domain dedication.',
      id: 'Tanpa hak cipta — dedikasi domain publik.',
    },
    fullText: {
      en: 'CC0 1.0 Universal — see https://creativecommons.org/publicdomain/zero/1.0/',
      id: '',
    },
    sortOrder: 20,
  },
  {
    slug: 'cc-by',
    name: 'CC BY 4.0',
    description: {
      en: 'Attribution required; commercial use allowed.',
      id: 'Atribusi wajib; penggunaan komersial diperbolehkan.',
    },
    fullText: { en: 'CC BY 4.0 — see https://creativecommons.org/licenses/by/4.0/', id: '' },
    sortOrder: 30,
  },
  {
    slug: 'cc-by-sa',
    name: 'CC BY-SA 4.0',
    description: {
      en: 'Attribution + ShareAlike; derivatives use same license.',
      id: 'Atribusi + ShareAlike; turunan menggunakan lisensi yang sama.',
    },
    fullText: { en: 'CC BY-SA 4.0 — see https://creativecommons.org/licenses/by-sa/4.0/', id: '' },
    sortOrder: 40,
  },
  {
    slug: 'cc-by-nc',
    name: 'CC BY-NC 4.0',
    description: {
      en: 'Attribution; non-commercial use only.',
      id: 'Atribusi; hanya penggunaan non-komersial.',
    },
    fullText: { en: 'CC BY-NC 4.0 — see https://creativecommons.org/licenses/by-nc/4.0/', id: '' },
    sortOrder: 50,
  },
  {
    slug: 'commercial',
    name: 'Commercial License',
    description: {
      en: 'Custom commercial terms — contact owner.',
      id: 'Ketentuan komersial khusus — hubungi pemilik.',
    },
    fullText: {
      en: 'Contact the asset owner for the full commercial license terms.',
      id: 'Hubungi pemilik aset untuk ketentuan lisensi komersial lengkap.',
    },
    sortOrder: 60,
  },
  {
    slug: 'internal-use-only',
    name: 'Internal Use Only',
    description: {
      en: 'Restricted to MGM Laboratory internal projects.',
      id: 'Terbatas untuk proyek internal MGM Laboratory.',
    },
    fullText: {
      en: 'For internal use within MGM Laboratory and its partners only. Redistribution outside the organization is prohibited.',
      id: 'Hanya untuk penggunaan internal di MGM Laboratory dan mitranya. Distribusi ulang ke luar organisasi dilarang.',
    },
    sortOrder: 70,
  },
] as const;

/** English titles for the six listings whose store title is Japanese. */
export const ENGLISH_TITLES: Record<string, string> = {
  'kipfel-3d': 'Kipfel - Original 3D Model',
  'booth-6004405': 'Secret Water Surface Eye Texture (Moving Waves)',
  mochifitter: 'MochiFitter',
  raindropshader: 'Lightweight Raindrop Shader (RainDropShader)',
  'lume-optic': 'Lume Optic Eye Shader System',
  'procreate-156': '156 Procreate Lace and Fringe Brushes',
};

/** Words that must be upper-cased / special-cased in tag display names. */
export const TAG_WORDS: Record<string, string> = {
  vfx: 'VFX',
  sfx: 'SFX',
  ui: 'UI',
  ux: 'UX',
  gui: 'GUI',
  hud: 'HUD',
  vr: 'VR',
  ar: 'AR',
  xr: 'XR',
  ai: 'AI',
  npc: 'NPC',
  rpg: 'RPG',
  fps: 'FPS',
  rts: 'RTS',
  pbr: 'PBR',
  fbx: 'FBX',
  glb: 'GLB',
  gltf: 'glTF',
  hdrp: 'HDRP',
  urp: 'URP',
  fx: 'FX',
  hdri: 'HDRI',
  lod: 'LOD',
  gpu: 'GPU',
  cpu: 'CPU',
  api: 'API',
  csharp: 'C#',
  vrchat: 'VRChat',
  unity: 'Unity',
  unreal: 'Unreal',
  blender: 'Blender',
  godot: 'Godot',
  '2d': '2D',
  '3d': '3D',
  '4k': '4K',
  '8k': '8K',
  mmo: 'MMO',
  moba: 'MOBA',
  wip: 'WIP',
  png: 'PNG',
  svg: 'SVG',
  ogg: 'OGG',
  wav: 'WAV',
  mp3: 'MP3',
  json: 'JSON',
  ik: 'IK',
  fk: 'FK',
  dots: 'DOTS',
  ecs: 'ECS',
  cc0: 'CC0',
};

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

/** Sentences usable on any asset. */
export const TOP_GENERIC: string[] = [
  'Exactly what I was looking for, dropped it into my project in a couple of minutes.',
  'The preview image undersells this one. It looks even better in context.',
  'Does the license allow use in a commercial mobile game? I am reading the terms now but a quick confirmation would help.',
  'Bookmarked for the next game jam, thanks for sharing.',
  'Clean organisation and sensible naming. That is rare to see.',
  'Any plans for an update with more variations?',
  'Used this in a small prototype last week and the whole team liked the style.',
  'Great value for what is included.',
  'Could you add a short readme next to the files? It would make onboarding easier for the team.',
  'Thanks for keeping the listing up to date, the changelog is really helpful.',
  'I am using this for a student project. Is it fine to credit you in the end screen?',
  'The original listing has more screenshots, worth a look before you download.',
  'Saved this to my library, I will test it properly over the weekend.',
  'Very polished. The attention to detail shows.',
  'Is there a version without baked lighting? I would like to relight everything myself.',
  'Would love to see a tutorial or a short video showing a typical setup.',
  'Solid pack. A few more variations of the smaller pieces would make it perfect.',
  'Pairs really well with other packs I already had.',
  'Works fine for me, no setup needed.',
  'Nice work. Everything feels consistent, which saves me a lot of time.',
  'Quick question: are the source files included or only the exported versions?',
  'Loaded this into our team project and it behaved well with the rest of our pipeline.',
  'I like the direction. Hoping for a v2 with more colour options.',
  'Perfect for the jam theme this month.',
  'Does anyone know if this plays nicely with a custom asset pipeline?',
  'Please keep these coming.',
  'We shipped a demo with this last month and got no complaints, so it holds up.',
  'The description is clear about what you get, which I appreciate.',
  'How large is the download once everything is imported?',
  'I compared it with similar listings and this one is the most complete.',
];

/** Sentences that mention the engine; {engine} and {ver} are substituted. */
export const TOP_ENGINE: string[] = [
  'Works out of the box in {engine}, no warnings in the console.',
  'Tested in {engine} {ver} and everything imported cleanly.',
  'Any chance of support for the next {engine} release?',
  'Had to adjust a couple of settings in {engine}, but after that it was smooth.',
  'Performance in {engine} is great, even on my older laptop.',
  'The {engine} setup took five minutes thanks to the notes in the description.',
  'I am migrating a project to {engine} {ver} and will report back if I hit anything odd.',
  'Looks great in {engine}. The default settings are a good starting point.',
];

export const CLOSERS: string[] = [
  'Thanks again!',
  'Five stars from me.',
  'Highly recommended.',
  'Looking forward to the next update.',
  'Appreciate the effort.',
  'Keep up the good work.',
  'Great job overall.',
  'Will definitely use this again.',
];

/** Indonesian comments for users whose locale is `id`. */
export const TOP_ID: string[] = [
  'Bagus banget, langsung saya pakai di proyek kuliah. Terima kasih sudah berbagi!',
  'Apakah lisensinya boleh dipakai untuk game komersial?',
  'Mantap, detailnya rapi dan mudah dipakai.',
  'Ditunggu update berikutnya ya.',
  'Sudah saya simpan di library, nanti dicoba akhir pekan.',
  'Penjelasannya jelas, setup-nya cuma beberapa menit.',
  'Kualitasnya di atas ekspektasi. Recommended!',
  'Kalau ada versi dengan lebih banyak variasi pasti keren.',
  'Terima kasih, sangat membantu untuk game jam kemarin.',
  'Apakah ada rencana dukungan untuk versi engine terbaru?',
  'Ukuran dan skalanya konsisten, jadi gampang disatukan dengan aset lain.',
  'Hasilnya bagus di proyek mobile saya, performanya aman.',
];

export const REPLY_OWNER: string[] = [
  'Thanks for the kind words! More variations are on my list for the next update.',
  'Good question. The license terms are on the original listing linked above, please check them before using it commercially.',
  'Glad it works for you. If anything looks off, let me know and I will take a look.',
  'Thanks for the feedback, I will add that to the roadmap.',
  'Yes, that is supported. Check the compatibility table on this page for the tested versions.',
  'Appreciate it! I will publish a tidy-up update soon.',
  'Good catch, I will fix that in the next version.',
  'Feel free to credit me, that would be great.',
  'I do not have a video yet, but I am planning a short walkthrough.',
  'The source files are not included, only the exported ones.',
  'Thanks for testing it so thoroughly.',
  'That should be fine. Let me know how it goes.',
];

export const REPLY_USER: string[] = [
  'Same here, worked without any changes on my side.',
  'Thanks for asking, I was wondering about that too.',
  'I had the same issue. Restarting the editor fixed it for me.',
  'Agreed, the consistency is a big plus.',
  '+1, would love to see that as well.',
  'I tried it yesterday and it behaves exactly as described.',
  'Good tip, thanks for sharing.',
  'Not sure, but the original listing mentions it in the FAQ.',
  'It worked for me after re-importing.',
  'Thanks for the heads up!',
  'I ended up doing it manually, it took about ten minutes.',
  'That matches my experience.',
  'Let us know how it goes.',
];

export const REPLY_DEEP: string[] = [
  'Makes sense, thanks for clarifying.',
  'Perfect, that solved it.',
  'Cool, I will give it a go this evening.',
  'Great, appreciate the quick answer.',
  'Following this thread for updates.',
  'Ah, I missed that. Thanks!',
  'That is what I was hoping to hear.',
  'Thanks all, sorted on my side.',
];

export const REPLY_ID: string[] = [
  'Terima kasih infonya, sangat membantu.',
  'Sama, di saya juga berjalan lancar.',
  'Setuju, kualitasnya memang bagus.',
  'Oke, nanti saya coba lagi.',
];

export interface IssueSeed {
  title: string;
  detail: string;
  steps: string[];
}

/** Issue templates by asset group; `{engine}`/`{ver}` are substituted. */
export const ISSUES: Record<'visual' | 'animation' | 'audio' | 'code' | 'docs', IssueSeed[]> = {
  visual: [
    {
      title: 'Textures look washed out after import',
      detail:
        'The colours look flatter than in the preview images. I am on {engine} {ver} with the default settings.',
      steps: [
        'Import the files into a fresh project',
        'Open the demo content',
        'Compare against the screenshots on the listing',
      ],
    },
    {
      title: 'Some materials render pink',
      detail:
        'A few materials show up pink in the viewport. It looks like a render pipeline mismatch on my side, but maybe a note in the description would help.',
      steps: ['Import everything', 'Place the sample prefab in an empty scene'],
    },
    {
      title: 'Scale looks off compared to the preview',
      detail:
        'The pieces are noticeably larger than the reference scale in the screenshots. I had to rescale everything after import.',
      steps: ['Import the pack', 'Drop two pieces next to each other and compare'],
    },
    {
      title: 'Pivot points are not centred',
      detail:
        'On several pieces the pivot sits at the corner instead of the centre, which makes snapping awkward.',
      steps: ['Select a piece in the editor', 'Check the pivot gizmo'],
    },
    {
      title: 'Missing normal map on a few pieces',
      detail:
        'Three of the pieces have no normal map assigned, so they look flat next to the rest of the set.',
      steps: ['Open the material of the affected piece', 'Look at the normal map slot'],
    },
  ],
  animation: [
    {
      title: 'Animation loop has a visible jump',
      detail:
        'The idle loop pops slightly when it restarts. It is small, but noticeable at full speed.',
      steps: ['Play the clip on loop', 'Watch the first and last frames'],
    },
    {
      title: 'Root motion drifts over time',
      detail:
        'After a few cycles the character slowly slides away from its starting position on {engine} {ver}.',
      steps: ['Play the walk cycle for 30 seconds', 'Compare the position with the start'],
    },
    {
      title: 'Hips twist when retargeting to a humanoid rig',
      detail: 'Retargeting to my humanoid rig makes the hips twist in a couple of clips.',
      steps: ['Import the clips', 'Retarget to a standard humanoid', 'Play the run cycle'],
    },
  ],
  audio: [
    {
      title: 'Audio pops at the start of a few clips',
      detail:
        'A handful of clips have a small click at the very beginning. It is audible on headphones.',
      steps: ['Open the clip in an audio editor', 'Zoom into the first few milliseconds'],
    },
    {
      title: 'Loop point is not seamless',
      detail:
        'The ambient loop has an audible seam when it wraps around. Looks like a few samples are cut.',
      steps: ['Set the clip to loop', 'Listen around the loop point'],
    },
    {
      title: 'Volume differs between files',
      detail: 'Some files are much quieter than others, so I had to normalise them by hand.',
      steps: ['Import the whole pack', 'Compare the waveforms'],
    },
  ],
  code: [
    {
      title: 'Compile errors after updating',
      detail:
        'After updating to the latest version I get a couple of script errors on {engine} {ver}. A clean reimport does not help.',
      steps: ['Update to the newest version', 'Open the project and read the console'],
    },
    {
      title: 'Missing dependency is not mentioned',
      detail:
        'The tool needs an extra package that is not listed in the description. It would help to mention it up front.',
      steps: ['Import into an empty project', 'Open the main window'],
    },
    {
      title: 'Settings are not saved between sessions',
      detail: 'Any change I make in the settings window resets after restarting the editor.',
      steps: ['Change a setting', 'Restart the editor', 'Open the settings again'],
    },
    {
      title: 'Shader fails to compile on mobile targets',
      detail: 'Builds for Android fail with a shader compile error, while desktop builds are fine.',
      steps: ['Switch the build target to Android', 'Build the sample scene'],
    },
  ],
  docs: [
    {
      title: 'A page of the guide is missing',
      detail:
        'The table of contents lists a chapter that is not in the document. Maybe it was dropped by mistake.',
      steps: ['Open the document', 'Jump to the chapter from the contents'],
    },
    {
      title: 'Broken link in the description',
      detail: 'One of the links in the document leads to a page that no longer exists.',
      steps: ['Open the document', 'Follow the link in the introduction'],
    },
    {
      title: 'Typo in the changelog',
      detail: 'Version numbers in the changelog do not match the ones in the file list.',
      steps: ['Compare the changelog with the versions tab'],
    },
  ],
};

export const REPLY_ISSUE_OWNER: string[] = [
  'Thanks for reporting this. I can reproduce it and will look into it.',
  'Fixed in the latest version, please update and let me know if it persists.',
  'Could you share your {engine} version and settings?',
  'This is a known limitation. I will add a note to the description.',
  'Looking into it, this should be a quick fix.',
];

/* ------------------------------------------------------------------ */
/* Release notes                                                       */
/* ------------------------------------------------------------------ */

export const NOTES_INITIAL = [
  'Initial release in the library.',
  'Includes the full contents of the original listing.',
];
export const NOTES_MINOR = [
  'Fixed minor import warnings.',
  'Improved naming and folder structure.',
  'Added missing metadata.',
  'Updated the description and preview image.',
  'Compatibility check against newer versions.',
  'Small performance tweaks.',
  'Documentation clarified.',
  'Fixed a few typos in the included readme.',
];
export const NOTES_PATCH = [
  'Hotfix for an import issue.',
  'Corrected a missing reference.',
  'Fixed a small packaging mistake.',
];
export const NOTES_MAJOR = [
  'Major update with reorganised contents.',
  'Dropped support for the oldest editor versions.',
  'Added new variations.',
  'Reworked materials and setups for easier customisation.',
  'See the compatibility table for the supported versions.',
];

/* ------------------------------------------------------------------ */
/* Descriptions                                                        */
/* ------------------------------------------------------------------ */

export const DESC_EXTRA: Record<string, string[]> = {
  '3d-models': [
    'Check the preview image above and the original listing for the full list of models and formats.',
    'The original listing has the complete model list, formats and polygon details.',
  ],
  '2d-art': [
    'The original listing shows the full set of sprites and the supported resolutions.',
    'Look at the preview above and the original listing for the complete art set.',
  ],
  audio: [
    'Follow the original listing to hear the samples and see the full track or effect list.',
    'The original listing has audio previews and the complete file list.',
  ],
  vfx: [
    'The original listing shows the effects in motion along with the full effect list.',
    'See the original listing for video previews of every effect.',
  ],
  animation: [
    'The original listing shows the animations in motion and the full clip list.',
    'Check the original listing for preview clips and the rig requirements.',
  ],
  tools: [
    'The original listing documents the full feature set and setup steps.',
    'See the original listing for documentation and supported workflows.',
  ],
  scripts: [
    'The original listing explains the API and shows usage examples.',
    'See the original listing for documentation and code samples.',
  ],
  templates: [
    'The original listing describes the included systems and the intended project setup.',
    'See the original listing for the full list of included features.',
  ],
  shaders: [
    'The original listing shows the shader in action and the exposed parameters.',
    'See the original listing for previews and the full parameter reference.',
  ],
  documents: [
    'The original listing has a preview of the material and the full contents.',
    'See the original listing for sample pages and details about the format.',
  ],
};

export const ENGINE_LABEL: Record<string, string> = {
  UNITY: 'Unity',
  UNREAL: 'Unreal Engine',
  BLENDER: 'Blender',
  STANDALONE_3D: 'any 3D tool',
  AUDIO: 'audio production and game engines',
  IMAGE: 'image editors and game engines',
  VIDEO: 'video editors',
  OTHER: 'a range of tools',
  ENGINE_AGNOSTIC: 'any engine',
};

/* ------------------------------------------------------------------ */
/* Requests, reports, audit, webhooks                                  */
/* ------------------------------------------------------------------ */

export interface RequestSeed {
  title: string;
  link: string;
  type: string;
}

/** Real public listings that are not in the catalog. */
export const REQUEST_LISTINGS: RequestSeed[] = [
  {
    title: 'Sci-fi Sword',
    link: 'https://sketchfab.com/3d-models/sci-fi-sword-09ff916bd580422395bec19b8a9cbad6',
    type: '3D model',
  },
  {
    title: 'Stylized Tree',
    link: 'https://sketchfab.com/3d-models/stylized-tree-6d1aeea748f147789004bc03e1930d32',
    type: '3D model',
  },
  {
    title: 'Old Forged Fire Cauldron',
    link: 'https://sketchfab.com/3d-models/old-forged-fire-cauldron-1ecacae62f8e47a887c324a542ef6dbe',
    type: '3D model',
  },
  {
    title: 'Cat with jet pack',
    link: 'https://sketchfab.com/3d-models/cat-with-jet-pack-9afc8fd58c0d4f7d827f2007d6ac1e80',
    type: '3D model',
  },
  { title: 'Dino', link: 'https://poly.pizza/m/wuerCFCWNR', type: '3D model' },
  { title: 'Spaceship', link: 'https://poly.pizza/m/5nWeu4IQXVX', type: '3D model' },
  {
    title: 'Texel Density Checker',
    link: 'https://extensions.blender.org/add-ons/texel-density-checker/',
    type: 'Blender add-on',
  },
  {
    title: 'Node Arrange',
    link: 'https://extensions.blender.org/add-ons/node-arrange/',
    type: 'Blender add-on',
  },
  { title: 'Godot Skies', link: 'https://binbun3d.itch.io/godot-skies', type: 'Shader' },
  {
    title: 'Retro Master Shader',
    link: 'https://andicraft.itch.io/retro-master-shader',
    type: 'Shader',
  },
  {
    title: 'Stylized Sky',
    link: 'https://superhivemarket.com/products/stylized-sky',
    type: 'Shader',
  },
  {
    title: 'USM Lite - Unity Audio Manager',
    link: 'https://capbuugames.itch.io/audio-manager',
    type: 'Unity package',
  },
  {
    title: 'Ultimate Animated Character Pack',
    link: 'https://quaternius.com/packs/ultimatedanimatedcharacter.html',
    type: 'Animation pack',
  },
];

export const REQUEST_USES: string[] = [
  'Prototype for a university game project.',
  'Environment dressing for a small indie demo.',
  'Replacing placeholder art in our game jam entry.',
  'Needed for a tutorial series I am preparing.',
  'Internal tool for our art team to speed up reviews.',
  'Background assets for a mobile puzzle game.',
  'Reference for a classroom workshop on stylised rendering.',
  'Showcase scene for a portfolio piece.',
];
export const REQUEST_NOTES: string[] = [
  'The free version is enough for us.',
  'Happy to wait if it needs a license check first.',
  'We can credit the author in the game.',
  'Please let me know if a similar asset is already in the library.',
];
export const REQUEST_ADMIN_APPROVED: string[] = [
  'Approved. The listing is now on the curation list for the next batch.',
  'Approved, the license allows redistribution of the link. It will be added soon.',
  'Looks good. Approved and queued for import.',
];
export const REQUEST_ADMIN_REJECTED: string[] = [
  'Rejected: the license does not allow listing in a public library.',
  'Rejected: this overlaps with an asset already in the catalog.',
];
export const REQUEST_ADMIN_OTHER: string[] = [
  'Checking the license terms with the author.',
  'We need a little more detail about the intended use.',
];

export const REPORT_NOTES: Record<ReportCategory, string[]> = {
  MALICIOUS_FILE: [
    'The original page redirected me through an unusual ad link before the download. Please double check.',
    'My antivirus flagged the package after I followed the link. It may be a false positive but is worth a look.',
    'The listing asks to install an unrelated executable first.',
    'The link goes to a different domain than the store name suggests.',
  ],
  BROKEN_ASSET: [
    'The preview image does not match what the listing describes.',
    'Several textures seem to be missing after importing.',
    'The original listing page returns a 404 for me.',
    'The files look corrupted, the import stops half way.',
    'Wrong category: this is a shader, not a model pack.',
    'The description is in the wrong language and incomplete.',
  ],
};
export const REPORT_ADMIN_NOTES: string[] = [
  'Checked the original listing, it looks fine.',
  'Contacted the owner and waiting for a reply.',
  'Confirmed the problem and archived the asset.',
  'Duplicate of an earlier report.',
  'False positive; the link points to the official store.',
];

export const AUDIT_REASONS: string[] = [
  'Reported broken preview',
  'Duplicate listing',
  'Owner request',
  'Policy review',
  'Metadata clean-up',
  'Outdated description',
];

export const WEBHOOK_TYPES: string[] = [
  'asset.published',
  'asset.updated',
  'version.published',
  'comment.created',
  'issue.created',
  'report.created',
  'request.created',
  'featured.updated',
];
export const WEBHOOK_RECIPIENTS: string[] = [
  'https://hooks.preview.example/library-events',
  'https://chat.preview.example/hooks/asset-alerts',
  'https://ci.preview.example/api/library-sync',
];

export const ISSUE_STATUS_WEIGHTS: [IssueStatus, number][] = [
  ['OPEN', 45],
  ['ACKNOWLEDGED', 25],
  ['RESOLVED', 30],
];

export const COUNTRY_WEIGHTS: [string, number][] = [
  ['ID', 0.36],
  ['US', 0.14],
  ['JP', 0.1],
  ['GB', 0.07],
  ['DE', 0.06],
  ['BR', 0.05],
  ['IN', 0.05],
  ['SG', 0.05],
  ['MY', 0.04],
  ['AU', 0.04],
  ['FR', 0.04],
];

export const UNITY_DEPS = [
  { name: 'com.unity.render-pipelines.universal', version: '14.0.8', source: 'UPM' },
  { name: 'com.unity.textmeshpro', version: '3.0.6', source: 'UPM' },
  { name: 'com.unity.cinemachine', version: '2.9.7', source: 'UPM' },
  { name: 'com.unity.shadergraph', version: '14.0.8', source: 'UPM' },
  { name: 'DOTween (HOTween v2)', version: null, source: 'ASSET_STORE' },
];
export const UNREAL_DEPS = [
  { name: 'Niagara', version: null, source: 'ENGINE_PLUGIN' },
  { name: 'Enhanced Input', version: null, source: 'ENGINE_PLUGIN' },
  { name: 'Chaos Physics', version: null, source: 'ENGINE_PLUGIN' },
];
export const BLENDER_DEPS = [{ name: 'Rigify', version: null, source: 'BLENDER_ADDON' }];
