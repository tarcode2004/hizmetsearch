import type { SearchResult, Message, Conversation } from "./types";

export const MOCK_RESULTS: SearchResult[] = [
  {
    chunk: {
      chunk_id: "1",
      doc_id: "d1",
      text: "İman, kalbin tasdiki ve dilin ikrarıdır. Risale-i Nur'da iman hakikatleri, aklî ve naklî delillerle izah edilmiştir. Bediüzzaman Said Nursî, iman esaslarını modern çağın idrakine uygun bir şekilde açıklamıştır.",
      parent_text: "Birinci Söz: Bismillah her hayrın başıdır. Biz dahi başta ona başlarız. Bil ey nefsim, şu mübarek kelime İslam nişanı olduğu gibi, bütün mevcudatın lisan-ı hâliyle vird-i zebânıdır. İman, kalbin tasdiki ve dilin ikrarıdır. Risale-i Nur'da iman hakikatleri, aklî ve naklî delillerle izah edilmiştir.",
      source_type: "text",
      language: "tr",
      collection: "Risale-i Nur",
      title: "Sözler",
      author_speaker: "Bediüzzaman Said Nursî",
      publisher: "Sözler Neşriyat",
      chapter_section: "Birinci Söz",
      page_number: 5,
      timestamp_start: null,
      timestamp_end: null,
      // Real demo PDF (Mozilla's PDF.js sample — 14 pages, public). Viewer jumps to page 5.
      source_url: "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf",
      source_ext: "pdf",
      char_offset: 1240,
    },
    score: 0.95,
    rerank_score: 0.98,
  },
  {
    chunk: {
      chunk_id: "2",
      doc_id: "d2",
      text: "والإيمان هو التصديق بالقلب والإقرار باللسان. وقد بيّن النورسي في رسائل النور حقائق الإيمان بأدلة عقلية ونقلية تناسب فهم العصر الحديث.",
      parent_text: null,
      source_type: "text",
      language: "ar",
      collection: "Risale-i Nur",
      title: "الكلمات",
      author_speaker: "بديع الزمان سعيد النورسي",
      publisher: "",
      chapter_section: "الكلمة الأولى",
      page_number: 3,
      timestamp_start: null,
      timestamp_end: null,
      source_url: "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf",
      source_ext: "pdf",
      char_offset: 420,
    },
    score: 0.88,
    rerank_score: 0.91,
  },
  {
    chunk: {
      chunk_id: "3",
      doc_id: "d3",
      text: "Hizmet hareketi, eğitim ve diyalog faaliyetleri üzerinden toplumsal barışa katkıda bulunmayı hedeflemektedir. Fethullah Gülen, hoşgörü ve diyalogun önemine vurgu yapmıştır.",
      parent_text: "Hizmet hareketi, Fethullah Gülen'in öğretileri doğrultusunda dünya genelinde eğitim kurumları açmış, kültürler arası diyalog faaliyetleri yürütmüştür. Hizmet hareketi, eğitim ve diyalog faaliyetleri üzerinden toplumsal barışa katkıda bulunmayı hedeflemektedir.",
      source_type: "text",
      language: "tr",
      collection: "Hizmet",
      title: "Küresel Barışa Doğru",
      author_speaker: "Fethullah Gülen",
      publisher: "Nil Yayınları",
      chapter_section: "Diyalog ve Hoşgörü",
      page_number: 42,
      timestamp_start: null,
      timestamp_end: null,
      source_url: "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf",
      source_ext: "pdf",
      char_offset: 18500,
    },
    score: 0.82,
    rerank_score: 0.85,
  },
  {
    chunk: {
      chunk_id: "4",
      doc_id: "d4",
      text: "Namaz ibadetin özüdür. Beş vakit namaz, müminin miracı olarak kabul edilir. Risale-i Nur'da namazın hikmetleri ve faydaları detaylı şekilde ele alınmıştır.",
      parent_text: null,
      source_type: "audio",
      language: "tr",
      collection: "Risale-i Nur",
      title: "Dördüncü Söz - Sohbet",
      author_speaker: "Mehmet Kırkıncı",
      publisher: "",
      chapter_section: "Namaz Bahsi",
      page_number: null,
      timestamp_start: 125.5,
      timestamp_end: 189.2,
      // Real public demo audio — SoundHelix track 1 (~6 min, CC, widely used as HTML5 audio demo)
      source_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      source_ext: "mp3",
    },
    score: 0.79,
    rerank_score: 0.82,
  },
  {
    chunk: {
      chunk_id: "5",
      doc_id: "d5",
      text: "Faith is the affirmation of the heart and the declaration of the tongue. The Risale-i Nur collection explains the truths of faith through both rational and traditional evidence, making them accessible to the modern mind.",
      parent_text: null,
      source_type: "text",
      language: "en",
      collection: "Risale-i Nur",
      title: "The Words",
      author_speaker: "Bediüzzaman Said Nursî",
      publisher: "Sözler Publications",
      chapter_section: "The First Word",
      page_number: 7,
      timestamp_start: null,
      timestamp_end: null,
      source_url: "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf",
      source_ext: "pdf",
      char_offset: 2100,
    },
    score: 0.75,
    rerank_score: 0.78,
  },
];

export const MOCK_AI_ANSWER = `İman, İslam geleneğinde **kalbin tasdiki ve dilin ikrarı** olarak tanımlanmaktadır [1]. Bu tanım, imanın hem iç dünyada hem de dış dünyada tezahür eden çok boyutlu bir kavram olduğunu göstermektedir.

Bediüzzaman Said Nursî, Risale-i Nur külliyatında iman hakikatlerini **aklî ve naklî delillerle** modern çağın idrakine uygun bir şekilde açıklamıştır [1]. Bu yaklaşım, geleneksel İslam ilimlerini çağdaş düşünceyle buluşturma çabasını yansıtmaktadır.

Arapça kaynaklarda da benzer bir tanım bulunmakta olup iman, kalbin tasdiki ve dilin ikrarı olarak ifade edilmektedir [2]. Nursî'nin bu yaklaşımı, hem akli hem de nakli delilleri bir arada kullanmasıyla dikkat çekmektedir.

İmanın pratik hayattaki yansıması olarak **namaz ibadeti** öne çıkmaktadır. Beş vakit namaz, müminin miracı olarak kabul edilir ve Risale-i Nur'da namazın hikmetleri detaylı şekilde ele alınmıştır [4].

İngilizce kaynaklarda da belirtildiği üzere, Risale-i Nur koleksiyonu iman hakikatlerini hem rasyonel hem de geleneksel kanıtlarla açıklayarak modern zihne erişilebilir kılmaktadır [5].`;

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    _id: "c1",
    userId: "u1",
    title: "İman hakikatleri hakkında",
    model: "gemini",
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    isArchived: false,
  },
  {
    _id: "c2",
    userId: "u1",
    title: "Namaz ve ibadet",
    model: "claude",
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
    isArchived: false,
  },
  {
    _id: "c3",
    userId: "u1",
    title: "Hizmet hareketi tarihi",
    model: "gemini",
    createdAt: Date.now() - 259200000,
    updatedAt: Date.now() - 259200000,
    isArchived: false,
  },
];

export const MOCK_MESSAGES: Message[] = [
  {
    _id: "m1",
    conversationId: "c1",
    role: "user",
    content: "Risale-i Nur'da iman nasıl tanımlanıyor?",
    isStreaming: false,
    createdAt: Date.now() - 86400000,
  },
  {
    _id: "m2",
    conversationId: "c1",
    role: "assistant",
    content: MOCK_AI_ANSWER,
    model: "gemini",
    sources: MOCK_RESULTS.map((r) => r.chunk),
    isStreaming: false,
    createdAt: Date.now() - 86399000,
  },
];
