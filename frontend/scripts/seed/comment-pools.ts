/**
 * Text pools for seeded comments, keyed by the tone of the comment they answer.
 *
 * Placeholders (a sentence is only used when every placeholder it contains has a value):
 *   {title}   asset title
 *   {engine}  Unity / Unreal Engine / Blender (engine-bound assets only)
 *   {ver}     an engine version from the asset's compatibility table
 *   {semver}  an asset version that existed when the comment was written
 *   {next}    the asset version published after the comment (fix announcements)
 *
 * Pure data; build-seed.ts decides which entry to use and enforces uniqueness.
 */

export type TopTone = 'question' | 'praise' | 'suggestion';
export type ReplyTone = 'question' | 'praise' | 'suggestion' | 'bug';

/* ---------------------------- top-level comments ---------------------------- */

export const TOP: Record<TopTone, string[]> = {
  question: [
    'Does the license allow use in a commercial mobile game? I am reading the terms now but a quick confirmation would help.',
    'Quick question: are the source files included or only the exported versions?',
    'How large is the download once everything is imported?',
    'Is {title} fine to use in a client project, or only in personal work?',
    'Can I redistribute modified versions inside my own asset pack?',
    'Does anyone know if this plays nicely with a custom asset pipeline?',
    'Is there a way to get the layered source of {title}? I would like to adjust a few things.',
    'Will future updates be free for people who already saved this?',
    'Has anyone tried this on a low-end laptop? I only have integrated graphics.',
    'Are the files already organised into folders, or is everything in one big directory?',
    'What is the difference between the free and the paid listing for {title}?',
    'Is the original author still maintaining this? The last release looks a while ago.',
    'Does it work offline, or does it need an account on the original store?',
    'Can this be used for a class assignment if I credit the author?',
    'Do I have to credit the creator in the game itself or is a credits file enough?',
    'Is there a way to preview everything before importing the whole thing?',
    'Which version of {title} is the most stable? I see {semver} listed here.',
    'Does the pack include a readme or any documentation?',
    'Is it okay to use this in a livestream or a video tutorial?',
    'I could not find the file formats in the description. Anyone know what is inside?',
    'Is this compatible with other packs from the same author, or do the styles differ?',
    'Do you know if the original page has a changelog? I would like to see what changed in {semver}.',
    'Is there a bundle with the matching assets from the same creator?',
    'Would this be suitable for a game jam with a strict 48 hour limit?',
    'How much setup does {title} need before it is usable in a scene?',
    'Can I use this in an educational workshop with around thirty students?',
    'Does the license cover use in a trailer or only inside the game?',
    'Is there a difference between the version on the original page and the one listed here?',
    'Are there any known limitations I should be aware of before building on top of this?',
    'Has someone compared this with similar listings in the same category?',
    'Does it include any third-party content that needs separate attribution?',
    'Could someone explain what the license means for a small studio of three people?',
    'Can I resell a game that contains assets from {title}?',
    'Is there a mobile friendly variant of this, or should I optimise it myself?',
    'Any tips for getting started with {title}? I am fairly new to this workflow.',
    'Is the content suitable for a project that targets all ages?',
  ],
  praise: [
    'Exactly what I was looking for, dropped it into my project in a couple of minutes.',
    'The preview image undersells this one. It looks even better in context.',
    'Clean organisation and sensible naming. That is rare to see.',
    'Used {title} in a small prototype last week and the whole team liked the style.',
    'Great value for what is included.',
    'Very polished. The attention to detail shows.',
    'Nice work. Everything feels consistent, which saves me a lot of time.',
    'Works fine for me, no setup needed.',
    'We shipped a demo with this last month and got no complaints, so it holds up.',
    'The description is clear about what you get, which I appreciate.',
    'I compared it with similar listings and this one is the most complete.',
    'Bookmarked for the next game jam, thanks for sharing.',
    'Perfect for the jam theme this month.',
    'This is the best thing I have found in this category so far.',
    'Version {semver} feels solid. Nothing broke when I dropped it into an existing project.',
    'Honestly better than some paid packs I have bought.',
    'Loaded this into our team project and it behaved well with the rest of our pipeline.',
    'The quality of {title} is far above what I expected from a listing like this.',
    'Saved this to my library and ended up using it the same evening.',
    'It just works. Thank you to whoever put this together.',
    'My students used {title} for their final projects and the results looked great.',
    'Beautiful work. I keep finding small details I missed the first time.',
    'This saved me a whole weekend of work.',
    'I have recommended {title} to three friends already.',
    'Everything lined up perfectly with our existing art direction.',
    'Fast to integrate and easy to customise. Exactly what a good asset should be.',
    'Loving the style. It gives the whole scene a unified look.',
    'Solid pack, I will be using it in my next release.',
    'No surprises in the download, everything matched the description.',
    'The best part is how little cleanup it needed.',
    'This listing is a good example of how to document an asset.',
    'Tried it on a weak machine and it still ran smoothly.',
    'Cannot believe this is available for this price.',
    'Perfect fit for our prototype. Thanks for putting {title} together.',
    'I have been looking for something like this for months.',
    'Impressive consistency across the whole set.',
    'Worth every minute I spent testing it.',
    'A pleasure to work with. Clear structure and no hidden surprises.',
  ],
  suggestion: [
    'Any plans for an update with more variations?',
    'I like the direction. Hoping for a v2 with more colour options.',
    'Could you add a short readme next to the files? It would make onboarding easier for the team.',
    'Would love to see a tutorial or a short video showing a typical setup.',
    'Solid pack. A few more variations of the smaller pieces would make it perfect.',
    'Is there a version without baked lighting? I would like to relight everything myself.',
    'A dark variant of {title} would be great for night scenes.',
    'It would help to mention the supported file formats near the top of the description.',
    'Maybe split {title} into smaller packs so people can pick only what they need?',
    'A sample scene showing everything together would be a great addition.',
    'Please consider adding a version with lower resolution textures for mobile.',
    'Some kind of index or overview image would make browsing the contents much easier.',
    'Adding a few more examples to the description would help new users a lot.',
    'Would be nice to see a short comparison with the previous version, {semver} looks quite different.',
    'It would be great if the next update included a proper changelog.',
    'Could you include a pivot-centred variant? It would save a lot of fixing on my side.',
    'A bundle with the matching assets from the same creator would be awesome.',
    'I would pay extra for a version with the full source files.',
    'Please keep a copy of the older versions available, some projects cannot upgrade.',
    'Would be nice to have a short list of tested versions near the top of the page.',
    'A colour-blind friendly palette option would be a great addition.',
    'More naming consistency between the files would make search easier.',
    'It would be amazing to get a stylised variant of {title} too.',
    'Could the description mention how many individual files are in the package?',
    'A short "getting started" paragraph would make this friendlier for beginners.',
    'Consider adding a preview video, static images do not do it justice.',
    'A lighter version without the extras would be useful for quick prototypes.',
    'Would you consider adding localisation notes for non-English projects?',
    'It would be useful to see the file sizes listed per version.',
    'I think a few more screenshots on the listing would convince more people to try it.',
    'Hoping the next release adds a few more themed variations.',
    'A short note on recommended settings would be very welcome.',
    'Maybe add a pack of simple placeholder versions for early prototyping?',
    'Support for the newest releases would be great to see in the next update.',
  ],
};

/** Engine-bound variants, only usable on Unity / Unreal / Blender assets. */
export const TOP_ENGINE: Record<TopTone, string[]> = {
  question: [
    'Does {title} work with the render pipeline I use in {engine}, or only a specific one?',
    'Has anyone tried this in {engine} {ver}? I am about to migrate a project.',
    'Is there a setup guide for {engine}? I could not find one in the description.',
    'Will it keep working after the next {engine} release?',
    'Do I need extra packages in {engine} to use {title}?',
    'Does it work with the default settings in {engine} {ver} or is some configuration needed?',
    'Is {title} usable on mobile targets in {engine}?',
    'Any known issues in {engine} {ver}?',
  ],
  praise: [
    'Works out of the box in {engine}, no warnings in the console.',
    'Tested in {engine} {ver} and everything imported cleanly.',
    'Performance in {engine} is great, even on my older laptop.',
    'Looks great in {engine}. The default settings are a good starting point.',
    'The {engine} setup took five minutes thanks to the notes in the description.',
    'Dropped {title} into a fresh {engine} {ver} project and it just worked.',
    'Very friendly to work with inside {engine}. Well done.',
    'Imports into {engine} without a single error. Rare these days.',
  ],
  suggestion: [
    'Any chance of support for the next {engine} release?',
    'It would be great to get a sample scene for {engine} {ver}.',
    'A short {engine} quick-start section would help a lot.',
    'Would you consider adding a variant tuned for {engine} on mobile?',
    'Please add the tested {engine} versions to the description.',
    'A demo project for {engine} would be a great addition.',
    'Adding an {engine} {ver} compatible build would be very welcome.',
    'Maybe document the recommended {engine} settings for {title}?',
  ],
};

/** Indonesian top-level comments, by tone (used for users whose locale is id). */
export const TOP_ID: Record<TopTone, string[]> = {
  question: [
    'Apakah lisensinya boleh dipakai untuk game komersial?',
    'Apakah ada rencana dukungan untuk versi engine terbaru?',
    'Apakah file sumbernya ikut disertakan?',
    'Boleh dipakai untuk tugas kuliah kalau saya cantumkan kreditnya?',
    'Ukuran unduhannya berapa besar setelah diimpor?',
    'Apakah {title} cocok untuk game mobile?',
    'Adakah dokumentasi singkat untuk memulai?',
    'Kalau dipakai di proyek tim kecil, apakah perlu lisensi tambahan?',
  ],
  praise: [
    'Bagus banget, langsung saya pakai di proyek kuliah. Terima kasih sudah berbagi!',
    'Mantap, detailnya rapi dan mudah dipakai.',
    'Penjelasannya jelas, setup-nya cuma beberapa menit.',
    'Kualitasnya di atas ekspektasi. Recommended!',
    'Terima kasih, sangat membantu untuk game jam kemarin.',
    'Ukuran dan skalanya konsisten, jadi gampang disatukan dengan aset lain.',
    'Hasilnya bagus di proyek mobile saya, performanya aman.',
    'Sudah saya simpan di library, nanti dicoba akhir pekan.',
    '{title} benar-benar menghemat waktu saya minggu ini.',
    'Gaya visualnya konsisten, cocok sekali untuk prototipe saya.',
  ],
  suggestion: [
    'Ditunggu update berikutnya ya.',
    'Kalau ada versi dengan lebih banyak variasi pasti keren.',
    'Semoga ada tutorial singkat untuk pemula.',
    'Sebaiknya ditambahkan contoh scene supaya lebih mudah dipahami.',
    'Mohon ditambahkan daftar versi engine yang sudah diuji.',
    'Akan lebih baik kalau ada versi yang lebih ringan untuk perangkat mobile.',
  ],
};

export const CLOSERS: string[] = [
  'Thanks again!',
  'Five stars from me.',
  'Highly recommended.',
  'Looking forward to the next update.',
  'Appreciate the effort.',
  'Keep up the good work.',
  'Great job overall.',
  'Will definitely use this again.',
  'Cheers!',
  'Well done.',
  'Many thanks.',
  'Really glad I found this.',
];

/* --------------------------------- replies --------------------------------- */

interface ReplyPool {
  owner: string[];
  user: string[];
  ownerId: string[];
  userId: string[];
}

/** First-level replies, keyed by the tone of the top-level comment. */
export const REPLY: Record<ReplyTone, ReplyPool> = {
  question: {
    // Topic-neutral answers; topic-specific ones live in QUESTION_ANSWERS.
    owner: [
      'Good question. The original listing linked above has more detail on that.',
      'I will add a note about this to the description of {title}.',
      'Updates are announced in the changelog on the versions tab.',
      'I tested it on version {semver} and it behaved as described.',
      'Good point. I will check with the original author and update the page.',
      'The original page has more detail on that, the link is at the bottom of the description.',
      'I am not sure yet. I will reply here once I have an answer from the author.',
      'It is aimed at small teams, so it should be easy to adopt.',
      'Thanks for asking, that is a useful point to clarify in the description.',
      'Short answer: yes. The longer answer is on the original listing.',
    ],
    user: [
      'Not sure, but the original listing mentions it in the FAQ.',
      'Thanks for asking, I was wondering about that too.',
      'I used it in a client project and had no problems.',
      'It worked for me without any extra setup.',
      'It is fine for jams, I did that last weekend.',
      'The original page covers this, as far as I remember.',
      'I would wait for the author to confirm, but it worked for me.',
      'Following, I would like to know this as well.',
    ],
    ownerId: [
      'Terima kasih sudah bertanya. Detailnya ada di halaman asli yang ditautkan di atas.',
      'Silakan cek tabel kompatibilitas di halaman ini untuk versi yang sudah diuji.',
      'Saya akan menambahkan catatan soal ini di deskripsi {title}.',
      'Semuanya sudah lengkap, tidak perlu paket tambahan.',
    ],
    userId: [
      'Setahu saya detailnya ada di halaman asli, coba dicek dulu.',
      'Di saya berjalan lancar tanpa pengaturan tambahan.',
      'Terima kasih sudah bertanya, saya juga penasaran soal itu.',
      'Semoga ada yang bisa memastikan, saya juga ingin tahu.',
    ],
  },
  praise: {
    owner: [
      'Thanks for the kind words! More variations are on my list for the next update.',
      'Glad it works for you. If anything looks off, let me know and I will take a look.',
      'Appreciate it! I will publish a tidy-up update soon.',
      'Thanks for testing it so thoroughly.',
      'That means a lot, I put a lot of care into {title}.',
      'Happy to hear it fit your project so well.',
      'Thank you! Feel free to share what you build with it.',
      'Thanks for taking the time to write this.',
      'So glad it saved you some time.',
      'Thanks, comments like this keep me motivated to improve {title}.',
      'Thank you, I will keep the next update in the same spirit.',
      'Great to hear. I will keep the structure the same in future versions.',
      'Much appreciated, and thanks for the detailed feedback.',
      'Thanks for the support, it is very encouraging.',
      'Thank you for trying {title}! More is coming.',
      'Nice to know that it works in a real project. Thanks!',
    ],
    user: [
      'Same here, worked without any changes on my side.',
      'Agreed, the consistency is a big plus.',
      'I tried it yesterday and it behaves exactly as described.',
      'That matches my experience.',
      'Totally agree, it is one of the better listings in this category.',
      'Seconded. It is nice to see something so tidy.',
      'Same experience here, it was ready to use in minutes.',
      'Glad I am not the only one who thinks so.',
      'I came here to say the same thing.',
      'Fully agree, I bookmarked it right away.',
      'It has been solid for me as well.',
      'Good to hear. I was on the fence about trying it.',
      'Thanks for the review, that convinced me to give it a go.',
      'Yes! It also looks great next to other assets.',
    ],
    ownerId: [
      'Terima kasih banyak! Variasi tambahan sudah ada di daftar update berikutnya.',
      'Senang mendengarnya. Kalau ada yang aneh, kabari saja ya.',
      'Terima kasih sudah mencoba dan memberi masukan.',
      'Terima kasih, kata-kata seperti ini bikin semangat memperbarui {title}.',
    ],
    userId: [
      'Setuju, di saya juga berjalan mulus.',
      'Sama, saya juga puas dengan hasilnya.',
      'Terima kasih ulasannya, jadi tertarik mencoba.',
      'Benar, rapi dan mudah dipakai.',
    ],
  },
  suggestion: {
    owner: [
      'Thanks for the feedback, I will add that to the roadmap.',
      'Good idea, a sample scene is on my list.',
      'That is a fair point, I will update the description soon.',
      'I will look into a lighter variant after the next release.',
      'Noted! I will see what fits into the next update.',
      'Thanks, a readme is coming with the next version.',
      'That would be a nice addition. I will start with the most requested variants.',
      'I cannot promise a date, but this is on my list for {title}.',
      'I am working on more variations and will announce them here.',
      'Good suggestion, a changelog is now part of every release.',
      'I will think about splitting it up, thanks for raising it.',
      'Thanks. The tested versions will be listed more clearly from now on.',
      'Appreciate the idea, I will try to include it in {next}.',
    ],
    user: [
      '+1, would love to see that as well.',
      'Good idea, that would help me too.',
      'Seconded, a sample scene would be great.',
      'I was thinking the same thing.',
      'Same request here, hopefully it makes the next update.',
      'This would make {title} even better.',
      'Would use that immediately if it existed.',
      'Great suggestion, adding my vote.',
      'I asked for something similar on another listing, so there is clearly demand.',
      'Yes please, this would save me a lot of time.',
      'That is a nice idea, especially for beginners.',
      'Count me in as well.',
    ],
    ownerId: [
      'Terima kasih masukannya, saya masukkan ke roadmap.',
      'Ide bagus, contoh scene sudah ada di daftar saya.',
      'Catat! Akan saya usahakan di update berikutnya.',
      'Terima kasih, deskripsi akan segera saya perbarui.',
    ],
    userId: [
      'Setuju, saya juga mau fitur itu.',
      'Ide bagus, itu akan membantu saya juga.',
      '+1, semoga masuk update berikutnya.',
      'Saya juga mengharapkan hal yang sama.',
    ],
  },
  bug: {
    owner: [
      'Thanks for reporting this. I can reproduce it and will look into it.',
      'Could you share your {engine} version and settings?',
      'This is a known limitation. I will add a note to the description.',
      'Looking into it, this should be a quick fix.',
      'Thanks for the clear steps. I can see the problem on my side too.',
      'Sorry about that. Does it happen with a fresh import of version {semver}?',
      'As a workaround, reimporting the affected files once should help.',
      'Thanks, I have added this to my list for {title}.',
      'I could not reproduce it yet. Which version are you on?',
      'Good catch. I will check the other files for the same problem.',
      'Please try disabling any other asset packs and tell me if it still happens.',
      'Understood, I will prepare a fix and post here when it is ready.',
      'Thanks for the screenshot, that helps a lot.',
      'This looks like a packaging mistake on my side. Sorry!',
      'I am looking at it this week.',
      'Acknowledged. I will update the status here as soon as I have news.',
    ],
    user: [
      'I have the same issue. Restarting the editor fixed it for me.',
      'Same problem here on version {semver}.',
      'Confirming, it happens on my machine too.',
      'It worked for me after re-importing.',
      'I worked around it by fixing the file manually, it took about ten minutes.',
      'Not an issue on my side, maybe it depends on the project settings.',
      'Thanks for reporting, I was about to post the same thing.',
      'I can reproduce this with the default settings as well.',
      'Seeing the same thing, adding a +1 here.',
      'A clean reimport helped in my case.',
      'Happens to me only on the first import, not afterwards.',
      'Same on {title}, I did not change anything after importing.',
    ],
    ownerId: [
      'Terima kasih sudah melapor. Saya bisa mereproduksinya dan akan segera dicek.',
      'Bisa tolong sebutkan versi engine dan pengaturan yang dipakai?',
      'Ini keterbatasan yang sudah diketahui, akan saya catat di deskripsi.',
      'Maaf atas ketidaknyamanannya, perbaikan sedang disiapkan.',
    ],
    userId: [
      'Saya mengalami masalah yang sama.',
      'Setelah impor ulang, di saya sudah normal.',
      'Terima kasih sudah melapor, saya juga kena.',
      'Di saya tidak terjadi, mungkin tergantung pengaturan proyek.',
    ],
  },
};

/** Owner announces a fix that really shipped in a later version ({next}). */
export const REPLY_FIXED: string[] = [
  'Fixed in version {next}, please update and let me know if it persists.',
  'Version {next} includes a fix for this. Thanks for the report!',
  'This is resolved in {next}. Sorry for the trouble.',
  'The latest release, {next}, should take care of it.',
];

/** Replies to replies (depth 2 and deeper). */
export const FOLLOW: { op: string[]; owner: string[]; other: string[]; id: string[] } = {
  op: [
    'Perfect, that solved it.',
    'Thanks, that makes sense.',
    'Great, appreciate the quick answer.',
    'That is what I was hoping to hear.',
    'Ah, I missed that. Thanks!',
    'Cool, I will give it a go this evening.',
    'Works now, thank you for the help.',
    'Thanks all, sorted on my side.',
    'Good to know, I will try that.',
    'That did the trick on {title}.',
    'Thanks, I will mark this as sorted for now.',
    'Appreciate the detailed answer.',
    'Makes sense, thanks for clarifying.',
    'I will report back after testing it properly.',
    'Understood, thank you both.',
    'Brilliant, that answers my question.',
  ],
  owner: [
    'You are welcome! Let me know if anything else comes up.',
    'Glad that helped. Feel free to open an issue if it returns.',
    'Happy to help. Enjoy using {title}!',
    'Thanks for confirming, that helps me improve the listing.',
    'No problem. I will keep an eye on this thread.',
    'Great to hear it works now.',
    'Thanks for following up!',
    'Let me know how it goes.',
  ],
  other: [
    'Following this thread for updates.',
    'Good to know, I was about to ask the same.',
    'Thanks for sharing that, very useful.',
    'Interesting, I will try that as well.',
    'Same here, this thread answered my question too.',
    'Useful discussion, thanks everyone.',
    'Let us know how it goes.',
    'That is good to hear.',
    'I had the same experience, thanks for confirming.',
    'Good tip, thanks for sharing.',
    'Thanks for the heads up!',
    'This is helpful for people who find this thread later.',
  ],
  id: [
    'Terima kasih, sudah jelas sekarang.',
    'Oke, nanti saya coba lagi.',
    'Siap, terima kasih bantuannya.',
    'Sama, saya juga sudah berhasil.',
    'Terima kasih infonya, sangat membantu.',
    'Mantap, masalahnya sudah beres.',
  ],
};

/* ---------------------------------- issues ---------------------------------- */

export interface IssueSeed {
  title: string;
  detail: string;
  steps: string[];
}

export type IssueGroup = 'visual' | 'animation' | 'audio' | 'code' | 'docs';

/** Issue templates by asset group. */
export const ISSUES: Record<IssueGroup, IssueSeed[]> = {
  visual: [
    {
      title: 'Textures look washed out after import',
      detail:
        'The colours of {title} look flatter than in the preview image, even with the default settings.',
      steps: [
        'Import the files into a fresh project',
        'Open the demo content',
        'Compare against the screenshots on the listing',
      ],
    },
    {
      title: 'Some materials render pink',
      detail:
        'A few materials show up pink in the viewport on {engine} {ver}. It looks like a render pipeline mismatch.',
      steps: ['Import everything', 'Place the sample piece in an empty scene'],
    },
    {
      title: 'Scale looks off compared to the preview',
      detail:
        'The pieces in version {semver} are noticeably larger than the reference scale in the screenshots.',
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
        'Three pieces of {title} have no normal map assigned, so they look flat next to the rest of the set.',
      steps: ['Open the material of the affected piece', 'Look at the normal map slot'],
    },
    {
      title: 'Preview image does not match the files',
      detail:
        'Some of the items shown in the preview image are not part of the files I received for {title}.',
      steps: ['Compare the preview image with the imported contents'],
    },
    {
      title: 'Seams visible on tiling textures',
      detail: 'The tiling textures show visible seams when repeated more than a few times.',
      steps: ['Apply a texture to a large plane', 'Set tiling to 8 by 8', 'Look at the edges'],
    },
    {
      title: 'Inconsistent file naming',
      detail:
        'File names mix upper and lower case and spaces, which breaks my import script on version {semver}.',
      steps: ['Run a script that lists the imported files', 'Look at the naming'],
    },
    {
      title: 'Back faces are missing',
      detail:
        'Several meshes are invisible from behind, which is a problem for the close-up shots.',
      steps: ['Place the camera behind a mesh', 'Check backface culling'],
    },
    {
      title: 'Duplicate files in the package',
      detail: 'I found a few duplicated textures under different names, which bloats the project.',
      steps: ['Import the package', 'Sort the texture folder by size'],
    },
    {
      title: 'Colours differ between variants',
      detail:
        'The second colour variant of {title} is slightly more saturated than the preview suggests.',
      steps: ['Place both variants side by side', 'Compare in the same lighting'],
    },
    {
      title: 'Lightmap UVs overlap',
      detail: 'Baking lighting produces artefacts because some lightmap UVs overlap.',
      steps: ['Open the baked lighting view', 'Look at the overlapping islands'],
    },
  ],
  animation: [
    {
      title: 'Animation loop has a visible jump',
      detail:
        'The idle loop in {title} pops slightly when it restarts. It is small, but noticeable at full speed.',
      steps: ['Play the clip on loop', 'Watch the first and last frames'],
    },
    {
      title: 'Root motion drifts over time',
      detail:
        'After a few cycles the character slowly slides away from its starting position on version {semver}.',
      steps: ['Play the walk cycle for 30 seconds', 'Compare the position with the start'],
    },
    {
      title: 'Hips twist when retargeting to a humanoid rig',
      detail: 'Retargeting to my humanoid rig makes the hips twist in a couple of clips.',
      steps: ['Import the clips', 'Retarget to a standard humanoid', 'Play the run cycle'],
    },
    {
      title: 'Feet slide during the run cycle',
      detail: 'The feet slide on the ground at the default playback speed.',
      steps: ['Play the run cycle on a flat plane', 'Watch the foot contact points'],
    },
    {
      title: 'Clip names are unclear',
      detail:
        'Several clips in {title} are named "Take 001", so I cannot tell what they contain without opening each one.',
      steps: ['Import the pack', 'Open the animation list'],
    },
    {
      title: 'Animation events fire twice',
      detail: 'Footstep events in version {semver} fire twice per step, which doubles the audio.',
      steps: ['Add a listener for the footstep event', 'Play the walk cycle'],
    },
  ],
  audio: [
    {
      title: 'Audio pops at the start of a few clips',
      detail:
        'A handful of clips in {title} have a small click at the very beginning. It is audible on headphones.',
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
    {
      title: 'Sample rate is inconsistent',
      detail:
        'Files in version {semver} use different sample rates, which causes extra conversion at runtime.',
      steps: ['Open the file properties', 'Compare the sample rates'],
    },
    {
      title: 'Some tracks are mislabelled',
      detail:
        'Two tracks in {title} have swapped names compared to the listing, so the mood does not match.',
      steps: ['Play the tracks in order', 'Compare with the track list on the original page'],
    },
    {
      title: 'Clipping on loud effects',
      detail: 'A few loud effects clip when played together with music at full volume.',
      steps: ['Play an explosion and the main theme together', 'Watch the meter'],
    },
    {
      title: 'Metadata tags are missing',
      detail: 'The files have no tags, so my music library cannot sort the pack by mood.',
      steps: ['Open the files in a tag editor'],
    },
  ],
  code: [
    {
      title: 'Compile errors after updating',
      detail:
        'After updating to version {semver} I get a couple of script errors on {engine} {ver}. A clean reimport does not help.',
      steps: ['Update to the newest version', 'Open the project and read the console'],
    },
    {
      title: 'Missing dependency is not mentioned',
      detail:
        '{title} needs an extra package that is not listed in the description. It would help to mention it up front.',
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
    {
      title: 'Null reference when the scene has no camera',
      detail:
        'Version {semver} throws a null reference in the first frame if the scene has no main camera.',
      steps: ['Open an empty scene', 'Enter play mode'],
    },
    {
      title: 'Window layout resets on every domain reload',
      detail: 'The tool window of {title} loses its layout whenever scripts recompile.',
      steps: ['Dock the window', 'Edit any script', 'Wait for the recompile'],
    },
    {
      title: 'Garbage allocation every frame',
      detail:
        'The profiler shows small allocations each frame while {title} is active, which adds up on mobile.',
      steps: ['Open the profiler', 'Enable the sample scene', 'Look at the GC column'],
    },
    {
      title: 'Documentation does not match the API',
      detail:
        'The example in the description calls a method that no longer exists in version {semver}.',
      steps: ['Copy the example from the description', 'Build the project'],
    },
    {
      title: 'Does not work with assembly definitions',
      detail: 'Referencing {title} from an assembly definition fails with missing type errors.',
      steps: ['Create an assembly definition', 'Reference the scripts', 'Compile'],
    },
    {
      title: 'Editor freezes on large scenes',
      detail:
        'The editor freezes for a few seconds when I open the tool in a scene with many objects.',
      steps: ['Open a scene with 5000 objects', 'Open the tool window'],
    },
    {
      title: 'Undo does not work for changes made with the tool',
      detail: 'Changes made through the tool cannot be undone with the standard shortcut.',
      steps: ['Apply a change', 'Press undo'],
    },
    {
      title: 'Warning spam in the console',
      detail:
        'Every time the project loads there is a stream of deprecation warnings coming from {title}.',
      steps: ['Open the project', 'Read the console'],
    },
  ],
  docs: [
    {
      title: 'A page of the guide is missing',
      detail:
        'The table of contents of {title} lists a chapter that is not in the document. Maybe it was dropped by mistake.',
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
    {
      title: 'Fonts are not embedded',
      detail: 'The document falls back to a default font on my machine, so the layout shifts.',
      steps: ['Open the file on a machine without the font installed'],
    },
    {
      title: 'Images are low resolution when printed',
      detail: 'The diagrams in {title} look blurry when printed at A4.',
      steps: ['Print the second chapter', 'Compare with the on-screen view'],
    },
    {
      title: 'Outdated screenshots',
      detail:
        'Several screenshots show an older interface than the one in version {semver}, which is confusing for beginners.',
      steps: ['Follow the first tutorial', 'Compare the screenshots with the real UI'],
    },
  ],
};

/* ------------------------- topic-aware question answers ------------------------- */

export type QuestionTopic = 'license' | 'source' | 'size' | 'docs' | 'performance' | 'compat';

const TOPIC_PATTERNS: [QuestionTopic, RegExp][] = [
  [
    'license',
    /licen|lisensi|commercial|komersial|redistribut|resell|credit|kredit|attribution|terms|client project|trailer|livestream|all ages|studio of/i,
  ],
  ['source', /source files|layered|file formats|formats|file sumber/i],
  ['size', /how large|download once|ukuran|unduhan|file sizes/i],
  [
    'docs',
    /readme|documentation|dokumentasi|guide|getting started|tips for|setup guide|how much setup/i,
  ],
  ['performance', /laptop|mobile|low-end|performance|graphics/i],
  ['compat', /compatible|pipeline|engine|render|version|packs from|bundle|update|maintain/i],
];

/** Which kind of question a comment asks, from its text (null: nothing specific). */
export function questionTopic(text: string): QuestionTopic | null {
  for (const [topic, re] of TOPIC_PATTERNS) if (re.test(text)) return topic;
  return null;
}

/** Answers that fit one kind of question, for the owner and for other users. */
export const QUESTION_ANSWERS: Record<QuestionTopic, { owner: string[]; user: string[] }> = {
  license: {
    owner: [
      'Good question. The license terms are on the original listing linked above, please check them before using {title} commercially.',
      'It should be fine for most projects, but read the license on the original page to be sure.',
      'Credit in a credits file is enough, no need to show it in the game itself.',
      'Redistributing the original files is not allowed, but using them inside your game is.',
      'The license is summarised at the top of this page, and the full terms are on the original listing.',
      'Commercial use is covered by the license shown here, but read the original terms for edge cases like resale.',
      'For a small studio the usual rules apply: use it inside your products, do not resell the files on their own.',
    ],
    user: [
      'I think the license is on the original listing, worth a look before you start.',
      'I asked the same thing last month. The author replied on the original page that it is fine for commercial use.',
      'I would double check the terms, they differ between listings.',
      'I used it in a client project and had no problems with the license.',
      'Check the license badge at the top of this page, it summarises it well.',
      'The terms allowed it in my case, but my project was small.',
    ],
  },
  source: {
    owner: [
      'The source files are not included, only the exported ones.',
      'Only the exported files are provided; the original page lists the formats.',
      'I do not have the layered sources to share, sorry.',
      'The formats are listed on the original page. Everything in the download is ready to use as is.',
    ],
    user: [
      'From what I saw, the source files are not part of the download.',
      'I think only the exported files are included, at least that is what I got.',
      'The original listing mentions the formats, I would check there.',
    ],
  },
  size: {
    owner: [
      'The download is small, the files here only point to the original store page.',
      'The size depends on the version, see the file list under each version.',
      'Sizes are listed per version on this page.',
      'It is lightweight, nothing unusual.',
    ],
    user: [
      'The download is tiny since it only links to the store page.',
      'Mine was only a few kilobytes, it is just a link file.',
      'I did not notice anything large either.',
    ],
  },
  docs: {
    owner: [
      'There is no separate documentation yet, but the description lists what is inside.',
      'I will add a short getting started note to the description of {title}.',
      'The description and the original page should get you going, a quick-start guide is planned.',
      'Start with the sample content if there is any, then open the original page for details.',
    ],
    user: [
      'There is a short readme in the original package if I remember right.',
      'The original page has a decent overview, that is how I got started.',
      'I started with the defaults and read the original listing, that was enough.',
    ],
  },
  performance: {
    owner: [
      'It works fine on mobile as far as I know, but I have not profiled it myself.',
      'It is not heavy, but test on your target hardware to be safe.',
      'I tested it on a mid-range laptop and it was fine.',
      'Performance depends on your settings, the defaults are light.',
    ],
    user: [
      'It ran fine on my older laptop.',
      'No problems on integrated graphics here.',
      'Works on mobile in my project, though I lowered the quality a bit.',
    ],
  },
  compat: {
    owner: [
      'Yes, that is supported. Check the compatibility table on this page for the tested versions.',
      'No extra packages are needed, everything is self-contained.',
      'I tested it on version {semver} and it behaved as described.',
      'The styles are consistent across my other listings, so they mix well.',
      'Good point. I will check with the original author and update the page.',
    ],
    user: [
      'I am on a similar setup and had no issues.',
      'I believe the latest update fixed that, version {semver} looks good here.',
      'Mixes well with other packs in my experience.',
      'It worked for me without any extra setup.',
    ],
  },
};

/** Owner replies to suggestions about video or tutorial content. */
export const SUGGESTION_VIDEO_OWNER: string[] = [
  'I do not have a video yet, but I am planning a short walkthrough.',
  'A walkthrough video is on my list, thanks for the nudge.',
  'Good idea, a short video of a typical setup is coming.',
];
export const VIDEO_RE = /video|tutorial|walkthrough/i;
