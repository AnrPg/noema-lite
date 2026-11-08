/* ===================== anatomy@1 — computable anatomy: the engine library of sim-spec@1 (docs/INTERACTIVE_LIBRARY.md, chapter docs/library/anatomy.md) =====================
   One general engine with eight modes (model.mode) over one curated graph of the human body (noema.anatomy/v1, embedded below):
     lesion   a lesion of a root, a part of a plexus, a nerve at a level or a site (foramen, tunnel) → which muscles are paralysed or
              weak, which movements, reflexes, skin areas, dermatomes and special functions are lost, the named signs (wrist drop,
              claw hand, winged scapula, Horner…), the findings that tell two lesions apart, variant sensitivity (Martin–Gruber…)
     query    facts and quizzes over the graph: innervation, roots, actions, attachments, blood supply, branches, foramina, drainage,
              ISNCSCI key muscles and key sensory points, joint classes, cranial nerve facts, foetal remnants
     trace    paths through the blood (adult and foetal), the lymph and the nerves, with blocked vessels and collateral routes
     rom      normal ranges of motion (AAOS 1965; AMA Guides, edition to verify) and the Beighton score
     biomech  2D statics: lever and joint reaction force, hip in single-leg stance (Pauwels), the NIOSH lifting equation, Winter's
              segment parameters, the moment arm of a straight-line muscle against the joint angle
     regions  hit-testing the pack's own labelled picture (polygons, polylines, circles), with part-of grading
     visual   the visual pathway: a lesion → the field defect of each eye
     cord     spinal cord syndromes (hemisection, complete, central, anterior, posterior) at a segment
   Sources: Moore KL, Dalley AF, Agur AMR, Clinically Oriented Anatomy 9e (2023); Standring S, Gray's Anatomy 42e (2020); FIPAT,
   Terminologia Anatomica 2e (2019); ISNCSCI 2019; others beside each method. Pure, bounded, deterministic JS: no DOM, no network,
   no clock; numbers, codes, structure ids and the structures' own short names (`s`) or the pack's keys only. Educational, never
   clinical advice. */
import NoemaLibCore from '../kernel/core.ts';
import type { Emit, NumFn, Rec, SceneData, Table, TableNode } from '../kernel/core.ts';
import type { Spec } from '../types.ts';
/* i18n-ignore-start */ // code, not text: only codes, numbers, ids and the model's own names leave this module
const C = NoemaLibCore;
const ID = 'anatomy@1';
type Str = readonly string[];
type Numx = number | string;
type Nums = Record<string, number>;
/** a structure of the graph: the fields its type has (a nerve its levels, a muscle its actions…) */
interface AnNode {
  id: string;
  type: string;
  en: string;
  la: string;
  fam?: string;
  partOf?: string[];
  parents?: string[];
  roots?: string[];
  levels?: string[];
  src?: string[];
  parent?: string | null;
  plevel?: string | null;
  pk?: number;
  pre?: boolean;
  cranial?: boolean;
  cn?: string;
  modality?: string[];
  exit?: string;
  cls?: string;
  dofs?: string[];
  inn?: string;
  actions?: { dof: string; prime: boolean }[];
  origin?: string[];
  insertion?: string[];
  arteries?: string[];
  parts?: string[];
  kind?: string;
  muscles?: string[];
  aff?: string[];
  nerves?: string[];
  vessels?: string[];
  seg?: string;
  kp?: string;
  fetal?: boolean;
  of?: string;
}
interface Edge {
  a: string;
  b: string;
  side: string | null;
  cont: boolean;
  sys: string;
  fetal?: boolean;
}
type Graph = ReturnType<typeof build>;
/** a row of SRC split at | (rows() reports a row of another length) */
type Row = [string, string, string, string, string, string, string, string, string, string];
/** a piece of a route: [node, from level, to level] */
type RSeg = [string, number, number];
interface Route {
  r: string | null;
  w: number;
  pre: boolean;
  segs: RSeg[];
}
interface InnEntry {
  nerve: string;
  level: string | null;
  roots: { r: string; w: number }[];
  w: number;
}
interface Cuts {
  cuts: Map<string, number[]>;
  roots: Set<string>;
  avulsion: boolean;
}
interface Findings {
  loss: Nums;
  muscle: Nums;
  move: Nums;
  reflex: Nums;
  area: Nums;
  fn: Nums;
  dermatome: Nums;
  sign: Nums;
  nerve: Nums;
  ulnarClaw: number;
  paralysed: number;
  weak: number;
  areasLost: number;
  areasPartial: number;
  reflexesAbnormal: number;
  signs: number;
}
type Group = 'loss' | 'muscle' | 'move' | 'reflex' | 'area' | 'fn' | 'dermatome' | 'sign' | 'nerve';
type Kind = 'scalar' | 'series' | 'scene';
interface Rel {
  readonly from: Str | '*';
  readonly to: Str | string;
}
/* the model, as checkSpec leaves it */
interface Label {
  readonly id: string;
  readonly key: string;
}
interface CommonM {
  readonly mode: string;
  readonly variants?: Str;
  readonly labels?: readonly Label[];
  readonly lang?: string;
}
interface Lesion {
  readonly at?: Str;
  readonly completeness?: Numx;
  readonly avulsion?: boolean;
}
interface LesionM extends CommonM {
  readonly lesions: readonly Lesion[];
  readonly pick?: Numx;
  readonly compare?: Numx;
  readonly findings?: Str;
}
interface Fact {
  readonly id: string;
  readonly rel: string;
  readonly from: string;
  readonly to: string;
}
interface Quiz {
  readonly rel: string;
  readonly from?: string;
  readonly to?: string;
  readonly choices: Str;
  readonly pick: Numx;
}
interface QueryM extends CommonM {
  readonly facts?: readonly Fact[];
  readonly quiz?: Quiz;
  readonly of?: string;
}
interface TraceM extends CommonM {
  readonly system?: string;
  readonly from: string;
  readonly to: string;
  readonly via?: Str;
  readonly avoid?: Str;
  readonly side?: string;
}
interface RomM extends CommonM {
  readonly joint?: string;
  readonly dof?: string;
  readonly source?: 'aaos' | 'ama';
  readonly measured?: Numx;
  readonly beighton?: Rec;
  readonly age?: Numx;
  readonly prepubertal?: boolean;
}
interface BiomechM extends CommonM {
  readonly lever?: Rec & { readonly loads: readonly Rec[] };
  readonly hip?: Rec;
  readonly niosh?: Rec & { readonly duration?: 'short' | 'moderate' | 'long'; readonly coupling?: string };
  readonly segment?: Rec & { readonly name: string };
  readonly arm?: Rec;
}
interface Region {
  readonly structure: string;
  readonly polygon?: readonly number[];
  readonly polyline?: readonly number[];
  readonly width?: number;
  readonly circle?: readonly number[];
  readonly z?: number;
}
interface RegionsM extends CommonM {
  readonly image: readonly [number, number];
  readonly regions: readonly Region[];
  readonly x: Numx;
  readonly y: Numx;
  readonly target?: string;
  readonly accept?: string;
  readonly tol?: Numx;
}
interface VisualM extends CommonM {
  readonly lesions: Str;
  readonly pick?: Numx;
  readonly combine?: boolean;
}
interface CordM extends CommonM {
  readonly level: string;
  readonly side?: string;
  readonly kind: string;
  readonly extent?: Numx;
}
type Model = CommonM & Rec;
type Getter = (o: unknown, k: string, d?: number) => number;
interface Bag {
  add(c: string): void;
  readonly out: Nums;
}
type Lab = (id: string) => { key: string | undefined } | { s: string };
interface RunOut {
  o: Record<string, unknown>;
  sr: Record<string, number[]>;
  sc: Record<string, SceneData>;
}
type RunFn = (m: never, g: Getter, I: Bag, lab: Lab) => RunOut;
interface Computed {
  scalars: Record<string, unknown>;
  series: Record<string, number[]>;
  scenes: Record<string, SceneData>;
  issues: Nums;
}
interface Prepared {
  fns: Map<string, NumFn>;
}
interface Idx {
  types: Record<string, string>;
  levels: Record<string, string[]>;
  dofs: Record<string, string[]>;
  movers: string[];
  muscles: string[];
  reflexes: string[];
  areas: string[];
  fns: string[];
  nerves: string[];
  cranial: string[];
  signs: string[];
  dermatomes: Str;
  segs: Str;
  variants: Record<string, string>;
  rom: { aaos: Nums; ama: Nums };
  rel: Readonly<Record<string, Rel>>;
  lesionable: Str;
  schema: Readonly<Record<string, Table>>;
  modes: Str;
  outs: Readonly<Record<string, Readonly<Record<Kind, Str>>>>;
  issues: Readonly<Record<string, Str>>;
  findingGroups: readonly Group[];
}
/* ======================================================================================================================
     THE CURATED DATA (noema.anatomy/v1, compact). Sources for every row: Moore KL, Dalley AF, Agur AMR, Clinically Oriented
     Anatomy 9th ed. (2023) [Moore9] — the muscle tables of chapters 3 (upper limb), 7 (lower limb), 8–9 (head, neck) and the
     plexus tables; Standring S (ed.), Gray's Anatomy 42nd ed. (2020) [Gray42]; FIPAT, Terminologia Anatomica 2nd ed. (2019) [TA2]
     for the Latin and English terms (the terms are public domain; no TA2 ID is invented here — xref ids are left for the
     build-time extractor, see the chapter). ISNCSCI 2019 (ASIA/ISCoS) for key muscles and key sensory points. Root values:
     "C5*" a major root (weight 2), "C5" a root (1), "C7~" a minor/inconstant root (0.5).
     Innervation: "nerve@level:roots" (the branch leaves the nerve at that level; no level = the nerve's last level); several
     separated by ";"; "=w" after the roots weights a nerve in a dual supply.
     CHECK BEFORE RELEASE (docs/library/anatomy.md §10): the AMA ROM edition (5th vs 6th, the rom table); the FMA licence (no FMA
     data or id is bundled); the ISNCSCI worksheet revision (2019 here; check the 2026 worksheet); the NIOSH FM table and its
     interpolation (nioshFM, verify); TA2 / Uberon / FMA xref ids not filled (the extractor is not written); the TA2Viewer repo licence.
     ====================================================================================================================== */
const SRC = {
  regions: [
    'head|head',
    'neck|neck',
    'thorax|thorax',
    'abdomen|abdomen',
    'pelvis|pelvis and perineum',
    'back|back',
    'upper-limb|upper limb',
    'lower-limb|lower limb',
    'heart-region|heart and great vessels',
  ],
  // id|en|region
  compartments: [
    'shoulder-girdle|muscles of the shoulder girdle|upper-limb',
    'rotator-cuff|rotator cuff|upper-limb',
    'anterior-arm|anterior compartment of arm|upper-limb',
    'posterior-arm|posterior compartment of arm|upper-limb',
    'anterior-forearm|anterior compartment of forearm|upper-limb',
    'posterior-forearm|posterior compartment of forearm|upper-limb',
    'thenar|thenar eminence|upper-limb',
    'hypothenar|hypothenar eminence|upper-limb',
    'hand-central|central compartment of hand|upper-limb',
    'pectoral|pectoral region|thorax',
    'gluteal|gluteal region|lower-limb',
    'anterior-thigh|anterior compartment of thigh|lower-limb',
    'medial-thigh|medial compartment of thigh|lower-limb',
    'posterior-thigh|posterior compartment of thigh|lower-limb',
    'anterior-leg|anterior compartment of leg|lower-limb',
    'lateral-leg|lateral compartment of leg|lower-limb',
    'posterior-leg|posterior compartment of leg|lower-limb',
    'foot-dorsum|dorsum of foot|lower-limb',
    'sole|sole of foot|lower-limb',
    'posterior-abdominal-wall|posterior abdominal wall|abdomen',
    'anterolateral-abdominal-wall|anterolateral abdominal wall|abdomen',
    'thoracic-wall|thoracic wall|thorax',
    'extraocular|extra-ocular muscles|head',
    'mastication|muscles of mastication|head',
    'facial-expression|muscles of facial expression|head',
    'pharynx-palate|pharynx and soft palate|neck',
    'larynx-muscles|intrinsic muscles of larynx|neck',
    'tongue-muscles|muscles of tongue|head',
    'neck-muscles|muscles of neck|neck',
    'perineum-muscles|muscles of perineum|pelvis',
    'intrinsic-eye|intrinsic muscles of eye|head',
    'middle-ear-muscles|muscles of middle ear|head',
  ],
  // plexus elements: id|en|la|parents (roots or elements)|family
  elements: [
    'upper-trunk|upper trunk|truncus superior|C5 C6|brachial',
    'middle-trunk|middle trunk|truncus medius|C7|brachial',
    'lower-trunk|lower trunk|truncus inferior|C8 T1|brachial',
    'upper-trunk-ant|anterior division of upper trunk|divisio anterior trunci superioris|upper-trunk|brachial',
    'upper-trunk-post|posterior division of upper trunk|divisio posterior trunci superioris|upper-trunk|brachial',
    'middle-trunk-ant|anterior division of middle trunk|divisio anterior trunci medii|middle-trunk|brachial',
    'middle-trunk-post|posterior division of middle trunk|divisio posterior trunci medii|middle-trunk|brachial',
    'lower-trunk-ant|anterior division of lower trunk|divisio anterior trunci inferioris|lower-trunk|brachial',
    'lower-trunk-post|posterior division of lower trunk|divisio posterior trunci inferioris|lower-trunk|brachial',
    'lateral-cord|lateral cord|fasciculus lateralis|upper-trunk-ant middle-trunk-ant|brachial',
    'medial-cord|medial cord|fasciculus medialis|lower-trunk-ant|brachial',
    'posterior-cord|posterior cord|fasciculus posterior|upper-trunk-post middle-trunk-post lower-trunk-post|brachial',
    'lumbosacral-trunk|lumbosacral trunk|truncus lumbosacralis|L4 L5|lumbosacral',
  ],
  // nerves: id|en|la|src (roots/elements; "parent@level"; "-" a cranial nerve; "T1!" preganglionic, cut only by an avulsion)|roots|levels|family
  nerves: [
    // cervical plexus (Moore9 ch. 9)
    'greater-occipital|greater occipital nerve|nervus occipitalis major|C2|C2||cervical',
    'lesser-occipital|lesser occipital nerve|nervus occipitalis minor|C2|C2||cervical',
    'great-auricular|great auricular nerve|nervus auricularis magnus|C2 C3|C2 C3||cervical',
    'transverse-cervical-nerve|transverse cervical nerve|nervus transversus colli|C2 C3|C2 C3||cervical',
    'supraclavicular-nerves|supraclavicular nerves|nervi supraclaviculares|C3 C4|C3 C4||cervical',
    'ansa-cervicalis|ansa cervicalis|ansa cervicalis|C1 C2 C3|C1 C2 C3||cervical',
    'cervical-muscular|muscular branches of cervical plexus|rami musculares plexus cervicalis|C3 C4|C3 C4||cervical',
    'phrenic|phrenic nerve|nervus phrenicus|C3 C4 C5|C3 C4 C5|neck thorax|cervical',
    // brachial plexus (Moore9 table 3.6)
    'dorsal-scapular|dorsal scapular nerve|nervus dorsalis scapulae|C4 C5|C4 C5||brachial',
    'long-thoracic|long thoracic nerve|nervus thoracicus longus|C5 C6 C7|C5 C6 C7||brachial',
    'nerve-to-subclavius|nerve to subclavius|nervus subclavius|upper-trunk|C5 C6||brachial',
    'suprascapular|suprascapular nerve|nervus suprascapularis|upper-trunk|C5 C6|origin suprascapular-notch spinoglenoid-notch|brachial',
    'lateral-pectoral|lateral pectoral nerve|nervus pectoralis lateralis|lateral-cord|C5 C6 C7||brachial',
    'medial-pectoral|medial pectoral nerve|nervus pectoralis medialis|medial-cord|C8 T1||brachial',
    'medial-cutaneous-arm|medial cutaneous nerve of arm|nervus cutaneus brachii medialis|medial-cord|T1||brachial',
    'medial-cutaneous-forearm|medial cutaneous nerve of forearm|nervus cutaneus antebrachii medialis|medial-cord|C8 T1||brachial',
    'upper-subscapular|upper subscapular nerve|nervus subscapularis superior|posterior-cord|C5 C6||brachial',
    'thoracodorsal|thoracodorsal nerve|nervus thoracodorsalis|posterior-cord|C6 C7 C8||brachial',
    'lower-subscapular|lower subscapular nerve|nervus subscapularis inferior|posterior-cord|C5 C6||brachial',
    'axillary|axillary nerve|nervus axillaris|posterior-cord|C5 C6|origin quadrangular-space|brachial',
    'superior-lateral-cutaneous-arm|superior lateral cutaneous nerve of arm|nervus cutaneus brachii lateralis superior|axillary@quadrangular-space|C5 C6||brachial',
    'radial|radial nerve|nervus radialis|posterior-cord|C5 C6 C7 C8 T1|axilla arm spiral-groove lateral-septum elbow|brachial',
    'posterior-cutaneous-arm|posterior cutaneous nerve of arm|nervus cutaneus brachii posterior|radial@axilla|C5 C6 C7 C8||brachial',
    'inferior-lateral-cutaneous-arm|inferior lateral cutaneous nerve of arm|nervus cutaneus brachii lateralis inferior|radial@spiral-groove|C5 C6||brachial',
    'posterior-cutaneous-forearm|posterior cutaneous nerve of forearm|nervus cutaneus antebrachii posterior|radial@spiral-groove|C5 C6 C7 C8||brachial',
    'superficial-radial|superficial branch of radial nerve|ramus superficialis nervi radialis|radial@elbow|C6 C7 C8||brachial',
    'deep-radial|deep branch of radial nerve (posterior interosseous)|ramus profundus nervi radialis|radial@elbow|C5 C6 C7 C8|elbow supinator forearm|brachial',
    'musculocutaneous|musculocutaneous nerve|nervus musculocutaneus|lateral-cord|C5 C6 C7|axilla arm elbow|brachial',
    'lateral-cutaneous-forearm|lateral cutaneous nerve of forearm|nervus cutaneus antebrachii lateralis|musculocutaneous@elbow|C5 C6||brachial',
    'median|median nerve|nervus medianus|lateral-cord medial-cord|C5 C6 C7 C8 T1|axilla arm elbow forearm wrist carpal-tunnel palm|brachial',
    'anterior-interosseous|anterior interosseous nerve|nervus interosseus antebrachii anterior|median@forearm|C7 C8 T1||brachial',
    'palmar-cutaneous-median|palmar branch of median nerve|ramus palmaris nervi mediani|median@wrist|C6 C7||brachial',
    'recurrent-median|recurrent (thenar) branch of median nerve|ramus recurrens nervi mediani|median@palm|C8 T1||brachial',
    'digital-median|common palmar digital nerves of median nerve|nervi digitales palmares communes nervi mediani|median@palm|C6 C7 C8 T1||brachial',
    'ulnar|ulnar nerve|nervus ulnaris|medial-cord lateral-cord|C7 C8 T1|axilla arm elbow forearm wrist guyon|brachial',
    'palmar-cutaneous-ulnar|palmar branch of ulnar nerve|ramus palmaris nervi ulnaris|ulnar@forearm|C8||brachial',
    'dorsal-cutaneous-ulnar|dorsal branch of ulnar nerve|ramus dorsalis nervi ulnaris|ulnar@forearm|C8||brachial',
    'superficial-ulnar|superficial branch of ulnar nerve|ramus superficialis nervi ulnaris|ulnar@guyon|C8 T1||brachial',
    'deep-ulnar|deep branch of ulnar nerve|ramus profundus nervi ulnaris|ulnar@guyon|C8 T1|guyon hypothenar palm|brachial',
    // thoracic and abdominal wall
    'intercostobrachial|intercostobrachial nerve|nervus intercostobrachialis|T2|T2||thoracic',
    'intercostal-nerves|intercostal nerves T1–T11|nervi intercostales|T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11|T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11||thoracic',
    'subcostal|subcostal nerve|nervus subcostalis|T12|T12||thoracic',
    // lumbar plexus (Moore9 table 5.x / 7.1)
    'iliohypogastric|iliohypogastric nerve|nervus iliohypogastricus|T12 L1|T12 L1||lumbosacral',
    'ilioinguinal|ilioinguinal nerve|nervus ilioinguinalis|L1|L1||lumbosacral',
    'genitofemoral|genitofemoral nerve|nervus genitofemoralis|L1 L2|L1 L2||lumbosacral',
    'genital-branch-gf|genital branch of genitofemoral nerve|ramus genitalis nervi genitofemoralis|genitofemoral|L1 L2||lumbosacral',
    'femoral-branch-gf|femoral branch of genitofemoral nerve|ramus femoralis nervi genitofemoralis|genitofemoral|L1 L2||lumbosacral',
    'lateral-cutaneous-thigh|lateral cutaneous nerve of thigh|nervus cutaneus femoris lateralis|L2 L3|L2 L3|pelvis inguinal-ligament|lumbosacral',
    'psoas-branches|muscular branches to psoas major|rami musculares (musculus psoas major)|L1 L2 L3|L1 L2 L3||lumbosacral',
    'femoral|femoral nerve|nervus femoralis|L2 L3 L4|L2 L3 L4|pelvis inguinal-ligament thigh|lumbosacral',
    'anterior-cutaneous-thigh|anterior cutaneous branches of femoral nerve|rami cutanei anteriores nervi femoralis|femoral@thigh|L2 L3||lumbosacral',
    'saphenous|saphenous nerve|nervus saphenus|femoral@thigh|L3 L4|adductor-canal knee|lumbosacral',
    'obturator|obturator nerve|nervus obturatorius|L2 L3 L4|L2 L3 L4|pelvis obturator-canal thigh|lumbosacral',
    'accessory-obturator|accessory obturator nerve (variant)|nervus obturatorius accessorius|L3 L4|L3 L4||lumbosacral',
    // sacral plexus (Moore9 table 7.x)
    'superior-gluteal|superior gluteal nerve|nervus gluteus superior|lumbosacral-trunk S1|L4 L5 S1||lumbosacral',
    'inferior-gluteal|inferior gluteal nerve|nervus gluteus inferior|lumbosacral-trunk S1 S2|L5 S1 S2||lumbosacral',
    'nerve-to-piriformis|nerve to piriformis|nervus musculi piriformis|S1 S2|S1 S2||lumbosacral',
    'nerve-to-obturator-internus|nerve to obturator internus|nervus musculi obturatorii interni|lumbosacral-trunk S1 S2|L5 S1 S2||lumbosacral',
    'nerve-to-quadratus-femoris|nerve to quadratus femoris|nervus musculi quadrati femoris|lumbosacral-trunk S1|L4 L5 S1||lumbosacral',
    'posterior-cutaneous-thigh|posterior cutaneous nerve of thigh|nervus cutaneus femoris posterior|S1 S2 S3|S1 S2 S3||lumbosacral',
    'pudendal|pudendal nerve|nervus pudendus|S2 S3 S4|S2 S3 S4|pelvis pudendal-canal|lumbosacral',
    'inferior-rectal|inferior anal (rectal) nerves|nervi anales inferiores|pudendal@pudendal-canal|S2 S3 S4||lumbosacral',
    'perineal-nerve|perineal nerve|nervus perinealis|pudendal@pudendal-canal|S2 S3 S4||lumbosacral',
    'dorsal-nerve-penis|dorsal nerve of penis / clitoris|nervus dorsalis penis / clitoridis|pudendal@pudendal-canal|S2 S3 S4||lumbosacral',
    'sciatic|sciatic nerve|nervus ischiadicus|lumbosacral-trunk S1 S2 S3|L4 L5 S1 S2 S3|pelvis gluteal thigh popliteal|lumbosacral',
    'tibial|tibial nerve|nervus tibialis|sciatic@popliteal|L4 L5 S1 S2 S3|popliteal leg ankle tarsal-tunnel|lumbosacral',
    'medial-calcaneal|medial calcaneal branches|rami calcanei mediales|tibial@ankle|S1 S2||lumbosacral',
    'sural|sural nerve|nervus suralis|tibial@popliteal|S1 S2||lumbosacral',
    'medial-plantar|medial plantar nerve|nervus plantaris medialis|tibial@tarsal-tunnel|L4 L5 S1 S2 S3||lumbosacral',
    'lateral-plantar|lateral plantar nerve|nervus plantaris lateralis|tibial@tarsal-tunnel|S1 S2 S3||lumbosacral',
    'common-fibular|common fibular (peroneal) nerve|nervus fibularis communis|sciatic@popliteal|L4 L5 S1 S2|popliteal fibular-neck|lumbosacral',
    'lateral-sural-cutaneous|lateral sural cutaneous nerve|nervus cutaneus surae lateralis|common-fibular@popliteal|L5 S1||lumbosacral',
    'deep-fibular|deep fibular nerve|nervus fibularis profundus|common-fibular@fibular-neck|L4 L5 S1|leg ankle|lumbosacral',
    'superficial-fibular|superficial fibular nerve|nervus fibularis superficialis|common-fibular@fibular-neck|L4 L5 S1 S2|leg ankle|lumbosacral',
    // cranial nerves (Moore9 ch. 10; Gray42): levels from the brainstem outwards
    'olfactory|olfactory nerve (CN I)|nervi olfactorii|-||cribriform-plate nasal-cavity|cranial',
    'optic|optic nerve (CN II)|nervus opticus|-||chiasm optic-canal orbit|cranial',
    'oculomotor|oculomotor nerve (CN III)|nervus oculomotorius|-||midbrain subarachnoid cavernous-sinus sof orbit|cranial',
    'oculomotor-superior|superior branch of oculomotor nerve|ramus superior nervi oculomotorii|oculomotor@orbit|||cranial',
    'oculomotor-inferior|inferior branch of oculomotor nerve|ramus inferior nervi oculomotorii|oculomotor@orbit|||cranial',
    'trochlear|trochlear nerve (CN IV)|nervus trochlearis|-||midbrain subarachnoid cavernous-sinus sof|cranial',
    'trigeminal|trigeminal nerve (CN V)|nervus trigeminus|-||pons cpa trigeminal-ganglion|cranial',
    'ophthalmic|ophthalmic nerve (CN V1)|nervus ophthalmicus|trigeminal@trigeminal-ganglion||cavernous-sinus sof orbit|cranial',
    'maxillary|maxillary nerve (CN V2)|nervus maxillaris|trigeminal@trigeminal-ganglion||cavernous-sinus foramen-rotundum face|cranial',
    'mandibular|mandibular nerve (CN V3)|nervus mandibularis|trigeminal@trigeminal-ganglion||foramen-ovale infratemporal|cranial',
    'lingual|lingual nerve|nervus lingualis|mandibular@infratemporal|||cranial',
    'inferior-alveolar|inferior alveolar nerve|nervus alveolaris inferior|mandibular@infratemporal|||cranial',
    'abducens|abducens nerve (CN VI)|nervus abducens|-||pons subarachnoid dorello cavernous-sinus sof|cranial',
    'facial|facial nerve (CN VII)|nervus facialis|-||pons cpa iam geniculate tympanic mastoid stylomastoid parotid|cranial',
    'greater-petrosal|greater petrosal nerve|nervus petrosus major|facial@geniculate|||cranial',
    'nerve-to-stapedius|nerve to stapedius|nervus stapedius|facial@tympanic|||cranial',
    'chorda-tympani|chorda tympani|chorda tympani|facial@mastoid|||cranial',
    'facial-temporal|temporal branches of facial nerve|rami temporales nervi facialis|facial@parotid|||cranial',
    'facial-zygomatic|zygomatic branches of facial nerve|rami zygomatici nervi facialis|facial@parotid|||cranial',
    'facial-buccal|buccal branches of facial nerve|rami buccales nervi facialis|facial@parotid|||cranial',
    'facial-marginal|marginal mandibular branch of facial nerve|ramus marginalis mandibularis nervi facialis|facial@parotid|||cranial',
    'facial-cervical|cervical branch of facial nerve|ramus colli nervi facialis|facial@parotid|||cranial',
    'vestibulocochlear|vestibulocochlear nerve (CN VIII)|nervus vestibulocochlearis|-||pons cpa iam|cranial',
    'glossopharyngeal|glossopharyngeal nerve (CN IX)|nervus glossopharyngeus|-||medulla jugular-foramen neck|cranial',
    'vagus|vagus nerve (CN X)|nervus vagus|-||medulla jugular-foramen neck thorax|cranial',
    'pharyngeal-vagus|pharyngeal branch of vagus nerve|ramus pharyngeus nervi vagi|vagus@neck|||cranial',
    'superior-laryngeal|superior laryngeal nerve|nervus laryngeus superior|vagus@neck|||cranial',
    'external-laryngeal|external branch of superior laryngeal nerve|ramus externus nervi laryngei superioris|superior-laryngeal|||cranial',
    'internal-laryngeal|internal branch of superior laryngeal nerve|ramus internus nervi laryngei superioris|superior-laryngeal|||cranial',
    'recurrent-laryngeal|recurrent laryngeal nerve|nervus laryngeus recurrens|vagus@thorax|||cranial',
    'accessory|accessory nerve (CN XI)|nervus accessorius|-||medulla jugular-foramen neck posterior-triangle|cranial',
    'hypoglossal|hypoglossal nerve (CN XII)|nervus hypoglossus|-||medulla hypoglossal-canal neck|cranial',
    // the oculosympathetic pathway: preganglionic fibres leave by the T1 ventral root (cut by a T1 avulsion), relay in the superior cervical ganglion
    'oculosympathetic|oculosympathetic pathway|truncus sympathicus, pars cervicalis; plexus caroticus internus|T1!|T1|cervical-chain superior-cervical-ganglion carotid-plexus cavernous-sinus|cranial',
  ],
  // cranial nerve facts: nerve|number|modality (sensory motor mixed; +parasympathetic)|exit from the brain (Moore9 table 10.1)
  cranial: [
    'olfactory|I|sensory|forebrain',
    'optic|II|sensory|forebrain',
    'oculomotor|III|motor parasympathetic|midbrain',
    'trochlear|IV|motor|midbrain',
    'trigeminal|V|mixed|pons',
    'abducens|VI|motor|pontomedullary',
    'facial|VII|mixed parasympathetic|pontomedullary',
    'vestibulocochlear|VIII|sensory|pontomedullary',
    'glossopharyngeal|IX|mixed parasympathetic|medulla',
    'vagus|X|mixed parasympathetic|medulla',
    'accessory|XI|motor|medulla',
    'hypoglossal|XII|motor|medulla',
  ],
  bones: [
    'occipital|occipital bone|os occipitale|head',
    'temporal|temporal bone|os temporale|head',
    'sphenoid|sphenoid|os sphenoidale|head',
    'mandible|mandible|mandibula|head',
    'maxilla|maxilla|maxilla|head',
    'hyoid|hyoid bone|os hyoideum|neck',
    'cervical-vertebrae|cervical vertebrae|vertebrae cervicales|back',
    'thoracic-vertebrae|thoracic vertebrae|vertebrae thoracicae|back',
    'lumbar-vertebrae|lumbar vertebrae|vertebrae lumbales|back',
    'sacrum|sacrum|os sacrum|pelvis',
    'coccyx|coccyx|os coccygis|pelvis',
    'ribs|ribs|costae|thorax',
    'sternum|sternum|sternum|thorax',
    'clavicle|clavicle|clavicula|upper-limb',
    'scapula|scapula|scapula|upper-limb',
    'humerus|humerus|humerus|upper-limb',
    'radius|radius|radius|upper-limb',
    'ulna|ulna|ulna|upper-limb',
    'scaphoid|scaphoid|os scaphoideum|upper-limb',
    'lunate|lunate|os lunatum|upper-limb',
    'triquetrum|triquetrum|os triquetrum|upper-limb',
    'pisiform|pisiform|os pisiforme|upper-limb',
    'trapezium|trapezium|os trapezium|upper-limb',
    'trapezoid|trapezoid|os trapezoideum|upper-limb',
    'capitate|capitate|os capitatum|upper-limb',
    'hamate|hamate|os hamatum|upper-limb',
    'metacarpals|metacarpals|ossa metacarpi|upper-limb',
    'phalanges-hand|phalanges of hand|ossa digitorum manus|upper-limb',
    'hip-bone|hip bone|os coxae|pelvis',
    'femur|femur|femur|lower-limb',
    'patella|patella|patella|lower-limb',
    'tibia|tibia|tibia|lower-limb',
    'fibula|fibula|fibula|lower-limb',
    'talus|talus|talus|lower-limb',
    'calcaneus|calcaneus|calcaneus|lower-limb',
    'navicular|navicular|os naviculare|lower-limb',
    'cuboid|cuboid|os cuboideum|lower-limb',
    'cuneiforms|cuneiforms|ossa cuneiformia|lower-limb',
    'metatarsals|metatarsals|ossa metatarsi|lower-limb',
    'phalanges-foot|phalanges of foot|ossa digitorum pedis|lower-limb',
  ],
  // landmarks (attachments): id|en|bone ("-" soft tissue)
  landmarks: [
    'superior-nuchal-line|superior nuchal line|occipital',
    'external-occipital-protuberance|external occipital protuberance|occipital',
    'ligamentum-nuchae|nuchal ligament|-',
    'spinous-processes-C7-T12|spinous processes C7–T12|thoracic-vertebrae',
    'spinous-processes-C7-T1|spinous processes C7–T1|thoracic-vertebrae',
    'spinous-processes-T2-T5|spinous processes T2–T5|thoracic-vertebrae',
    'spinous-processes-T7-T12|spinous processes T7–T12|thoracic-vertebrae',
    'transverse-processes-C1-C4|transverse processes C1–C4|cervical-vertebrae',
    'thoracolumbar-fascia|thoracolumbar fascia|-',
    'iliac-crest|iliac crest|hip-bone',
    'ribs-9-12|ribs 9–12|ribs',
    'ribs-1-8|external surfaces of ribs 1–8|ribs',
    'ribs-3-5|ribs 3–5|ribs',
    'rib-1|first rib and its costal cartilage|ribs',
    'clavicle-lateral-third|lateral third of clavicle|clavicle',
    'clavicle-medial-half|medial half of clavicle|clavicle',
    'clavicle-middle-third|inferior surface of middle third of clavicle|clavicle',
    'sternum-anterior|anterior surface of sternum|sternum',
    'costal-cartilages-1-6|costal cartilages 1–6|ribs',
    'external-oblique-aponeurosis|aponeurosis of external oblique|-',
    'acromion|acromion|scapula',
    'scapular-spine|spine of scapula|scapula',
    'scapula-medial-border|medial border of scapula|scapula',
    'scapula-superior-angle|superior angle of scapula|scapula',
    'scapula-medial-border-anterior|anterior surface of medial border of scapula|scapula',
    'coracoid-process|coracoid process|scapula',
    'supraspinous-fossa|supraspinous fossa|scapula',
    'infraspinous-fossa|infraspinous fossa|scapula',
    'subscapular-fossa|subscapular fossa|scapula',
    'scapula-lateral-border|lateral border of scapula|scapula',
    'scapula-inferior-angle|inferior angle of scapula|scapula',
    'supraglenoid-tubercle|supraglenoid tubercle|scapula',
    'infraglenoid-tubercle|infraglenoid tubercle|scapula',
    'greater-tubercle|greater tubercle of humerus|humerus',
    'lesser-tubercle|lesser tubercle of humerus|humerus',
    'intertubercular-sulcus|floor of intertubercular sulcus|humerus',
    'intertubercular-lateral-lip|lateral lip of intertubercular sulcus|humerus',
    'intertubercular-medial-lip|medial lip of intertubercular sulcus|humerus',
    'deltoid-tuberosity|deltoid tuberosity|humerus',
    'humerus-medial-middle|medial surface of middle third of humerus|humerus',
    'humerus-anterior-distal|distal half of anterior humerus|humerus',
    'humerus-posterior-above-groove|posterior humerus above the radial groove|humerus',
    'humerus-posterior-below-groove|posterior humerus below the radial groove|humerus',
    'medial-epicondyle|medial epicondyle of humerus|humerus',
    'lateral-epicondyle|lateral epicondyle of humerus|humerus',
    'lateral-supracondylar-ridge|lateral supracondylar ridge|humerus',
    'radial-tuberosity|radial tuberosity|radius',
    'bicipital-aponeurosis|bicipital aponeurosis|-',
    'radius-lateral-middle|middle of lateral surface of radius|radius',
    'radius-anterior-oblique-line|anterior oblique line of radius|radius',
    'radius-anterior|anterior surface of radius|radius',
    'radius-anterior-distal|distal quarter of anterior radius|radius',
    'radius-posterior|posterior surface of radius|radius',
    'radius-proximal|lateral, posterior and anterior surfaces of proximal third of radius|radius',
    'radial-styloid|lateral surface of distal radius (styloid base)|radius',
    'coronoid-process-ulna|coronoid process of ulna|ulna',
    'ulnar-tuberosity|tuberosity of ulna|ulna',
    'olecranon|olecranon|ulna',
    'ulna-posterior-border|posterior border of ulna|ulna',
    'ulna-anterior-medial|anterior and medial surfaces of ulna|ulna',
    'ulna-anterior-distal|distal quarter of anterior ulna|ulna',
    'ulna-posterior|posterior surface of ulna|ulna',
    'supinator-crest|supinator crest of ulna|ulna',
    'interosseous-membrane|interosseous membrane of forearm|-',
    'pisiform-bone|pisiform|pisiform',
    'hook-of-hamate|hook of hamate|hamate',
    'scaphoid-tubercle|tubercle of scaphoid|scaphoid',
    'trapezium-tubercle|tubercle of trapezium|trapezium',
    'capitate-bone|capitate|capitate',
    'flexor-retinaculum|flexor retinaculum|-',
    'palmar-aponeurosis|palmar aponeurosis|-',
    'metacarpal-1|first metacarpal|metacarpals',
    'metacarpal-1-base|base of first metacarpal|metacarpals',
    'metacarpal-2-base|base of second metacarpal|metacarpals',
    'metacarpal-3|third metacarpal|metacarpals',
    'metacarpal-3-base|base of third metacarpal|metacarpals',
    'metacarpal-5|fifth metacarpal|metacarpals',
    'metacarpal-5-base|base of fifth metacarpal|metacarpals',
    'metacarpals-sides|adjacent sides of metacarpals|metacarpals',
    'proximal-phalanx-thumb|base of proximal phalanx of thumb|phalanges-hand',
    'distal-phalanx-thumb|base of distal phalanx of thumb|phalanges-hand',
    'middle-phalanges-2-5|middle phalanges of digits 2–5|phalanges-hand',
    'distal-phalanges-2-5|distal phalanges of digits 2–5|phalanges-hand',
    'proximal-phalanx-5|base of proximal phalanx of little finger|phalanges-hand',
    'proximal-phalanges-2-4|bases of proximal phalanges 2–4|phalanges-hand',
    'extensor-expansions|extensor expansions of digits 2–5|-',
    'fdp-tendons|tendons of flexor digitorum profundus|-',
    'hypothenar-skin|skin of medial border of hand|-',
    'lumbar-transverse-processes|transverse processes of lumbar vertebrae|lumbar-vertebrae',
    'vertebral-bodies-T12-L5|bodies of T12–L5 and discs|lumbar-vertebrae',
    'iliac-fossa|iliac fossa|hip-bone',
    'asis|anterior superior iliac spine|hip-bone',
    'aiis|anterior inferior iliac spine|hip-bone',
    'ilium-gluteal-surface|external (gluteal) surface of ilium|hip-bone',
    'ilium-posterior|posterior ilium|hip-bone',
    'pectineal-line-pubis|pecten pubis|hip-bone',
    'pubis-body|body of pubis|hip-bone',
    'inferior-pubic-ramus|inferior pubic ramus|hip-bone',
    'ischiopubic-ramus|ischiopubic ramus|hip-bone',
    'ischial-tuberosity|ischial tuberosity|hip-bone',
    'ischial-spine|ischial spine|hip-bone',
    'obturator-membrane|obturator membrane and margins|hip-bone',
    'sacrum-anterior|anterior surface of sacrum|sacrum',
    'sacrum-dorsal|dorsal sacrum and coccyx|sacrum',
    'sacrotuberous-ligament|sacrotuberous ligament|-',
    'lesser-trochanter|lesser trochanter|femur',
    'greater-trochanter|greater trochanter|femur',
    'trochanteric-fossa|trochanteric fossa|femur',
    'quadrate-tubercle|quadrate tubercle|femur',
    'gluteal-tuberosity|gluteal tuberosity|femur',
    'iliotibial-tract|iliotibial tract|-',
    'intertrochanteric-line|intertrochanteric line|femur',
    'linea-aspera|linea aspera|femur',
    'pectineal-line-femur|pectineal line of femur|femur',
    'adductor-tubercle|adductor tubercle|femur',
    'femur-anterior-shaft|anterior and lateral shaft of femur|femur',
    'lateral-supracondylar-line|lateral supracondylar line of femur|femur',
    'femoral-condyles-posterior|posterior femoral condyles|femur',
    'lateral-femoral-condyle|lateral femoral condyle|femur',
    'patella-base|base of patella|patella',
    'tibial-tuberosity|tibial tuberosity (via patellar ligament)|tibia',
    'pes-anserinus|medial surface of proximal tibia (pes anserinus)|tibia',
    'medial-tibial-condyle|medial tibial condyle|tibia',
    'lateral-tibial-condyle|lateral tibial condyle|tibia',
    'tibia-lateral-surface|lateral surface of tibia|tibia',
    'tibia-posterior|posterior surface of tibia|tibia',
    'soleal-line|soleal line of tibia|tibia',
    'tibia-posterior-proximal|posterior tibia above the soleal line|tibia',
    'fibular-head|head of fibula|fibula',
    'fibula-anterior|anterior (medial) surface of fibula|fibula',
    'fibula-lateral|lateral surface of fibula|fibula',
    'fibula-posterior|posterior surface of fibula|fibula',
    'interosseous-membrane-leg|interosseous membrane of leg|-',
    'calcaneal-tuberosity|calcaneal tuberosity|calcaneus',
    'calcaneus-superolateral|superolateral calcaneus|calcaneus',
    'calcaneus-plantar|plantar surface of calcaneus|calcaneus',
    'navicular-tuberosity|tuberosity of navicular|navicular',
    'cuboid-bone|cuboid|cuboid',
    'medial-cuneiform|medial cuneiform|cuneiforms',
    'lateral-cuneiform|lateral cuneiform|cuneiforms',
    'metatarsal-1-base|base of first metatarsal|metatarsals',
    'metatarsal-5-base|base of fifth metatarsal|metatarsals',
    'metatarsal-5-tuberosity|tuberosity of fifth metatarsal|metatarsals',
    'metatarsals-2-4-bases|bases of metatarsals 2–4|metatarsals',
    'metatarsals-shafts|shafts of metatarsals|metatarsals',
    'proximal-phalanx-hallux|base of proximal phalanx of great toe|phalanges-foot',
    'distal-phalanx-hallux|base of distal phalanx of great toe|phalanges-foot',
    'phalanges-2-5-foot|middle and distal phalanges of toes 2–5|phalanges-foot',
    'proximal-phalanx-5-foot|base of proximal phalanx of little toe|phalanges-foot',
    'proximal-phalanges-2-5-foot|bases of proximal phalanges of toes 2–5|phalanges-foot',
    'fdl-tendon|tendon of flexor digitorum longus|-',
    'extensor-expansions-foot|extensor expansions of toes 2–5|-',
    'mandible-angle|angle and ramus of mandible|mandible',
    'zygomatic-arch|zygomatic arch|temporal',
    'temporal-fossa|temporal fossa|temporal',
    'coronoid-process-mandible|coronoid process of mandible|mandible',
    'mastoid-process|mastoid process|temporal',
    'manubrium|manubrium|sternum',
  ],
  // joints: id|en|la|class|dofs (functional = a set of movements, not one joint)
  joints: [
    'shoulder|glenohumeral joint|articulatio humeri|ball-and-socket|flexion extension abduction adduction medial-rotation lateral-rotation',
    'scapulothoracic|scapulothoracic movements|motus scapulae|functional|elevation depression protraction retraction upward-rotation downward-rotation',
    'acromioclavicular|acromioclavicular joint|articulatio acromioclavicularis|plane|',
    'sternoclavicular|sternoclavicular joint|articulatio sternoclavicularis|saddle|',
    'elbow|elbow joint (humero-ulnar)|articulatio cubiti|hinge|flexion extension',
    'radioulnar|radio-ulnar joints|articulationes radioulnares|pivot|pronation supination',
    'wrist|wrist joint|articulatio radiocarpalis|condyloid|flexion extension radial-deviation ulnar-deviation',
    'thumb-cmc|carpometacarpal joint of thumb|articulatio carpometacarpalis pollicis|saddle|flexion extension abduction adduction opposition',
    'thumb-mcp|metacarpophalangeal joint of thumb|articulatio metacarpophalangea pollicis|condyloid|flexion extension',
    'thumb-ip|interphalangeal joint of thumb|articulatio interphalangea pollicis|hinge|flexion extension',
    'mcp|metacarpophalangeal joints 2–5|articulationes metacarpophalangeae|condyloid|flexion extension abduction adduction hyperextension',
    'pip|proximal interphalangeal joints|articulationes interphalangeae proximales manus|hinge|flexion extension',
    'dip|distal interphalangeal joints|articulationes interphalangeae distales manus|hinge|flexion extension',
    'little-finger|movements of the little finger|motus digiti minimi|functional|abduction flexion opposition',
    'hip|hip joint|articulatio coxae|ball-and-socket|flexion extension abduction adduction medial-rotation lateral-rotation',
    'knee|knee joint|articulatio genus|hinge|flexion extension medial-rotation lateral-rotation',
    'ankle|ankle joint (talocrural)|articulatio talocruralis|hinge|dorsiflexion plantarflexion',
    'subtalar|subtalar and transverse tarsal joints|articulatio subtalaris|plane|inversion eversion',
    'toes|joints of toes 2–5|articulationes digitorum pedis|functional|flexion extension abduction adduction',
    'hallux|joints of great toe|articulationes hallucis|functional|flexion extension abduction adduction',
    'tmj|temporomandibular joint|articulatio temporomandibularis|hinge|elevation depression protrusion retrusion lateral-deviation',
    'atlanto-occipital|atlanto-occipital joint|articulatio atlantooccipitalis|condyloid|',
    'atlanto-axial|median atlanto-axial joint|articulatio atlantoaxialis mediana|pivot|',
    'cervical-spine|cervical spine|columna vertebralis, pars cervicalis|functional|flexion extension lateral-flexion rotation',
    'lumbar-spine|thoracolumbar spine|columna vertebralis, pars lumbalis|functional|flexion extension lateral-flexion rotation',
    'trunk|trunk movements|motus trunci|functional|flexion lateral-flexion rotation compression',
    'breathing|respiration|respiratio|functional|inspiration',
    'intervertebral-disc|intervertebral symphysis|symphysis intervertebralis|cartilaginous|',
    'pubic-symphysis|pubic symphysis|symphysis pubica|cartilaginous|',
    'cranial-suture|cranial sutures|suturae cranii|fibrous|',
    'tibiofibular-distal|tibiofibular syndesmosis|syndesmosis tibiofibularis|fibrous|',
    'sacroiliac|sacro-iliac joint|articulatio sacroiliaca|plane|',
    'eye|eye movements|motus bulbi oculi|functional|elevation depression abduction adduction intorsion extorsion',
    'eyelid|eyelid|palpebra|functional|elevation closure',
    'pupil|pupil|pupilla|functional|constriction dilation',
    'lens|accommodation|accommodatio|functional|accommodation',
    'face|facial expression|mimica|functional|brow-raise lip-closure smile cheek-compression mouth-depression neck-skin',
    'tongue|tongue|lingua|functional|protrusion retraction elevation',
    'palate|soft palate|palatum molle|functional|elevation tension',
    'pharynx|pharynx|pharynx|functional|constriction elevation',
    'larynx|vocal folds|plicae vocales|functional|abduction adduction tension',
    'middle-ear|ossicular chain|ossicula auditus|functional|damping',
    'neck-hyoid|hyoid and larynx|os hyoideum|functional|depression elevation',
    'perineum|perineal sphincters|sphincteres perinei|functional|anal-closure urethral-closure urethral-emptying testis-elevation',
  ],
  /* muscles: id|en|la|innervation|actions ("*" a prime mover)|origin|insertion|arteries|compartment|part of
       (Moore9 tables 3.1–3.13, 7.2–7.14, 8.x, 9.x; actions of limb muscles as in those tables) */
  muscles: [
    // shoulder girdle and pectoral region
    'trapezius|trapezius|musculus trapezius|accessory@posterior-triangle:|scapulothoracic.elevation* scapulothoracic.retraction* scapulothoracic.upward-rotation* scapulothoracic.depression|superior-nuchal-line external-occipital-protuberance ligamentum-nuchae spinous-processes-C7-T12|clavicle-lateral-third acromion scapular-spine|transverse-cervical-artery|shoulder-girdle|',
    'latissimus-dorsi|latissimus dorsi|musculus latissimus dorsi|thoracodorsal:C6 C7* C8|shoulder.extension* shoulder.adduction* shoulder.medial-rotation*|spinous-processes-T7-T12 thoracolumbar-fascia iliac-crest ribs-9-12|intertubercular-sulcus|thoracodorsal-artery|shoulder-girdle|',
    'levator-scapulae|levator scapulae|musculus levator scapulae|dorsal-scapular:C5;cervical-muscular:C3 C4|scapulothoracic.elevation* scapulothoracic.downward-rotation|transverse-processes-C1-C4|scapula-superior-angle|dorsal-scapular-artery transverse-cervical-artery|shoulder-girdle|',
    'rhomboid-minor|rhomboid minor|musculus rhomboideus minor|dorsal-scapular:C4 C5*|scapulothoracic.retraction* scapulothoracic.downward-rotation* scapulothoracic.elevation|ligamentum-nuchae spinous-processes-C7-T1|scapula-medial-border|dorsal-scapular-artery|shoulder-girdle|',
    'rhomboid-major|rhomboid major|musculus rhomboideus major|dorsal-scapular:C4 C5*|scapulothoracic.retraction* scapulothoracic.downward-rotation* scapulothoracic.elevation|spinous-processes-T2-T5|scapula-medial-border|dorsal-scapular-artery|shoulder-girdle|',
    'serratus-anterior|serratus anterior|musculus serratus anterior|long-thoracic:C5 C6* C7|scapulothoracic.protraction* scapulothoracic.upward-rotation*|ribs-1-8|scapula-medial-border-anterior|lateral-thoracic thoracodorsal-artery|pectoral|',
    'pectoralis-major|pectoralis major|musculus pectoralis major|||clavicle-medial-half sternum-anterior costal-cartilages-1-6 external-oblique-aponeurosis|intertubercular-lateral-lip|thoracoacromial|pectoral|',
    'pectoralis-major-clavicular|pectoralis major, clavicular head|pars clavicularis musculi pectoralis majoris|lateral-pectoral:C5 C6|shoulder.flexion* shoulder.adduction shoulder.medial-rotation|clavicle-medial-half|intertubercular-lateral-lip|thoracoacromial|pectoral|pectoralis-major',
    'pectoralis-major-sternocostal|pectoralis major, sternocostal head|pars sternocostalis musculi pectoralis majoris|lateral-pectoral:C7;medial-pectoral:C8 T1|shoulder.adduction* shoulder.medial-rotation* shoulder.extension|sternum-anterior costal-cartilages-1-6 external-oblique-aponeurosis|intertubercular-lateral-lip|thoracoacromial internal-thoracic|pectoral|pectoralis-major',
    'pectoralis-minor|pectoralis minor|musculus pectoralis minor|medial-pectoral:C8 T1|scapulothoracic.depression scapulothoracic.protraction|ribs-3-5|coracoid-process|thoracoacromial|pectoral|',
    'subclavius|subclavius|musculus subclavius|nerve-to-subclavius:C5 C6|scapulothoracic.depression|rib-1|clavicle-middle-third|thoracoacromial|pectoral|',
    'deltoid|deltoid|musculus deltoideus|axillary:C5* C6|shoulder.abduction* shoulder.flexion* shoulder.extension* shoulder.medial-rotation shoulder.lateral-rotation|clavicle-lateral-third acromion scapular-spine|deltoid-tuberosity|posterior-circumflex-humeral thoracoacromial|shoulder-girdle|',
    'supraspinatus|supraspinatus|musculus supraspinatus|suprascapular@suprascapular-notch:C5* C6|shoulder.abduction*|supraspinous-fossa|greater-tubercle|suprascapular-artery|rotator-cuff|',
    'infraspinatus|infraspinatus|musculus infraspinatus|suprascapular@spinoglenoid-notch:C5* C6|shoulder.lateral-rotation*|infraspinous-fossa|greater-tubercle|suprascapular-artery circumflex-scapular|rotator-cuff|',
    'teres-minor|teres minor|musculus teres minor|axillary:C5* C6|shoulder.lateral-rotation*|scapula-lateral-border|greater-tubercle|circumflex-scapular posterior-circumflex-humeral|rotator-cuff|',
    'teres-major|teres major|musculus teres major|lower-subscapular:C5 C6|shoulder.adduction* shoulder.medial-rotation* shoulder.extension|scapula-inferior-angle|intertubercular-medial-lip|circumflex-scapular thoracodorsal-artery|shoulder-girdle|',
    'subscapularis|subscapularis|musculus subscapularis|upper-subscapular:C5 C6=0.5;lower-subscapular:C5 C6=0.5|shoulder.medial-rotation* shoulder.adduction|subscapular-fossa|lesser-tubercle|subscapular-artery|rotator-cuff|',
    // arm
    'biceps-brachii|biceps brachii|musculus biceps brachii|musculocutaneous@arm:C5 C6 C7~|elbow.flexion* radioulnar.supination* shoulder.flexion|supraglenoid-tubercle coracoid-process|radial-tuberosity bicipital-aponeurosis|brachial|anterior-arm|',
    'coracobrachialis|coracobrachialis|musculus coracobrachialis|musculocutaneous@axilla:C5 C6* C7|shoulder.flexion shoulder.adduction|coracoid-process|humerus-medial-middle|brachial|anterior-arm|',
    'brachialis|brachialis|musculus brachialis|musculocutaneous@arm:C5 C6* C7~|elbow.flexion*|humerus-anterior-distal|coronoid-process-ulna ulnar-tuberosity|brachial radial-recurrent|anterior-arm|',
    'triceps-brachii|triceps brachii|musculus triceps brachii|||infraglenoid-tubercle humerus-posterior-above-groove humerus-posterior-below-groove|olecranon|profunda-brachii|posterior-arm|',
    'triceps-long|triceps brachii, long head|caput longum musculi tricipitis brachii|radial@axilla:C6 C7* C8|elbow.extension* shoulder.extension shoulder.adduction|infraglenoid-tubercle|olecranon|profunda-brachii|posterior-arm|triceps-brachii',
    'triceps-lateral|triceps brachii, lateral head|caput laterale musculi tricipitis brachii|radial@arm:C6 C7* C8|elbow.extension*|humerus-posterior-above-groove|olecranon|profunda-brachii|posterior-arm|triceps-brachii',
    'triceps-medial|triceps brachii, medial head|caput mediale musculi tricipitis brachii|radial@arm:C6 C7* C8|elbow.extension*|humerus-posterior-below-groove|olecranon|profunda-brachii|posterior-arm|triceps-brachii',
    'anconeus|anconeus|musculus anconeus|radial@spiral-groove:C7 C8 T1~|elbow.extension|lateral-epicondyle|olecranon|profunda-brachii|posterior-forearm|',
    // anterior forearm
    'pronator-teres|pronator teres|musculus pronator teres|median@elbow:C6 C7*|radioulnar.pronation* elbow.flexion|medial-epicondyle coronoid-process-ulna|radius-lateral-middle|ulnar-artery radial-artery|anterior-forearm|',
    'flexor-carpi-radialis|flexor carpi radialis|musculus flexor carpi radialis|median@elbow:C6 C7*|wrist.flexion* wrist.radial-deviation*|medial-epicondyle|metacarpal-2-base|radial-artery|anterior-forearm|',
    'palmaris-longus|palmaris longus|musculus palmaris longus|median@elbow:C7 C8*|wrist.flexion|medial-epicondyle|palmar-aponeurosis|ulnar-artery|anterior-forearm|',
    'flexor-carpi-ulnaris|flexor carpi ulnaris|musculus flexor carpi ulnaris|ulnar@forearm:C7 C8*|wrist.flexion* wrist.ulnar-deviation*|medial-epicondyle olecranon ulna-posterior-border|pisiform-bone hook-of-hamate metacarpal-5-base|ulnar-artery|anterior-forearm|',
    'flexor-digitorum-superficialis|flexor digitorum superficialis|musculus flexor digitorum superficialis|median@elbow:C7 C8* T1|pip.flexion* mcp.flexion wrist.flexion|medial-epicondyle coronoid-process-ulna radius-anterior-oblique-line|middle-phalanges-2-5|ulnar-artery radial-artery|anterior-forearm|',
    'flexor-digitorum-profundus|flexor digitorum profundus|musculus flexor digitorum profundus|||ulna-anterior-medial interosseous-membrane|distal-phalanges-2-5|ulnar-artery anterior-interosseous-artery|anterior-forearm|',
    'fdp-lateral|flexor digitorum profundus, lateral part (digits 2–3)|pars lateralis musculi flexoris digitorum profundi|anterior-interosseous:C8* T1|dip.flexion* pip.flexion mcp.flexion wrist.flexion|ulna-anterior-medial interosseous-membrane|distal-phalanges-2-5|anterior-interosseous-artery|anterior-forearm|flexor-digitorum-profundus',
    'fdp-medial|flexor digitorum profundus, medial part (digits 4–5)|pars medialis musculi flexoris digitorum profundi|ulnar@forearm:C8* T1|dip.flexion* pip.flexion mcp.flexion wrist.flexion|ulna-anterior-medial interosseous-membrane|distal-phalanges-2-5|ulnar-artery|anterior-forearm|flexor-digitorum-profundus',
    'flexor-pollicis-longus|flexor pollicis longus|musculus flexor pollicis longus|anterior-interosseous:C7 C8*|thumb-ip.flexion* thumb-mcp.flexion|radius-anterior interosseous-membrane|distal-phalanx-thumb|anterior-interosseous-artery|anterior-forearm|',
    'pronator-quadratus|pronator quadratus|musculus pronator quadratus|anterior-interosseous:C7 C8*|radioulnar.pronation*|ulna-anterior-distal|radius-anterior-distal|anterior-interosseous-artery|anterior-forearm|',
    // posterior forearm
    'brachioradialis|brachioradialis|musculus brachioradialis|radial@lateral-septum:C5 C6* C7~|elbow.flexion*|lateral-supracondylar-ridge|radial-styloid|radial-recurrent|posterior-forearm|',
    'extensor-carpi-radialis-longus|extensor carpi radialis longus|musculus extensor carpi radialis longus|radial@lateral-septum:C6* C7|wrist.extension* wrist.radial-deviation*|lateral-supracondylar-ridge|metacarpal-2-base|radial-recurrent radial-artery|posterior-forearm|',
    'extensor-carpi-radialis-brevis|extensor carpi radialis brevis|musculus extensor carpi radialis brevis|deep-radial@elbow:C7* C8|wrist.extension* wrist.radial-deviation|lateral-epicondyle|metacarpal-3-base|radial-artery|posterior-forearm|',
    'supinator|supinator|musculus supinator|deep-radial@elbow:C5 C6*|radioulnar.supination*|lateral-epicondyle supinator-crest|radius-proximal|radial-recurrent posterior-interosseous-artery|posterior-forearm|',
    'extensor-digitorum|extensor digitorum|musculus extensor digitorum|deep-radial@forearm:C7* C8|mcp.extension* pip.extension dip.extension wrist.extension|lateral-epicondyle|extensor-expansions|posterior-interosseous-artery|posterior-forearm|',
    'extensor-digiti-minimi|extensor digiti minimi|musculus extensor digiti minimi|deep-radial@forearm:C7* C8|mcp.extension|lateral-epicondyle|extensor-expansions|posterior-interosseous-artery|posterior-forearm|',
    'extensor-carpi-ulnaris|extensor carpi ulnaris|musculus extensor carpi ulnaris|deep-radial@forearm:C7* C8|wrist.extension* wrist.ulnar-deviation*|lateral-epicondyle ulna-posterior-border|metacarpal-5-base|posterior-interosseous-artery|posterior-forearm|',
    'abductor-pollicis-longus|abductor pollicis longus|musculus abductor pollicis longus|deep-radial@forearm:C7* C8|thumb-cmc.abduction* thumb-cmc.extension|ulna-posterior radius-posterior interosseous-membrane|metacarpal-1-base|posterior-interosseous-artery|posterior-forearm|',
    'extensor-pollicis-brevis|extensor pollicis brevis|musculus extensor pollicis brevis|deep-radial@forearm:C7* C8|thumb-mcp.extension* thumb-cmc.extension|radius-posterior interosseous-membrane|proximal-phalanx-thumb|posterior-interosseous-artery|posterior-forearm|',
    'extensor-pollicis-longus|extensor pollicis longus|musculus extensor pollicis longus|deep-radial@forearm:C7* C8|thumb-ip.extension* thumb-mcp.extension thumb-cmc.extension|ulna-posterior interosseous-membrane|distal-phalanx-thumb|posterior-interosseous-artery|posterior-forearm|',
    'extensor-indicis|extensor indicis|musculus extensor indicis|deep-radial@forearm:C7* C8|mcp.extension|ulna-posterior interosseous-membrane|extensor-expansions|posterior-interosseous-artery|posterior-forearm|',
    // hand
    'abductor-pollicis-brevis|abductor pollicis brevis|musculus abductor pollicis brevis|recurrent-median:C8 T1*|thumb-cmc.abduction*|flexor-retinaculum scaphoid-tubercle trapezium-tubercle|proximal-phalanx-thumb|superficial-palmar-arch|thenar|',
    'flexor-pollicis-brevis|flexor pollicis brevis|musculus flexor pollicis brevis|||flexor-retinaculum trapezium-tubercle|proximal-phalanx-thumb|superficial-palmar-arch|thenar|',
    'fpb-superficial|flexor pollicis brevis, superficial head|caput superficiale musculi flexoris pollicis brevis|recurrent-median:C8 T1*|thumb-mcp.flexion*|flexor-retinaculum trapezium-tubercle|proximal-phalanx-thumb|superficial-palmar-arch|thenar|flexor-pollicis-brevis',
    'fpb-deep|flexor pollicis brevis, deep head|caput profundum musculi flexoris pollicis brevis|deep-ulnar@palm:C8 T1*|thumb-mcp.flexion|flexor-retinaculum trapezium-tubercle|proximal-phalanx-thumb|deep-palmar-arch|thenar|flexor-pollicis-brevis',
    'opponens-pollicis|opponens pollicis|musculus opponens pollicis|recurrent-median:C8 T1*|thumb-cmc.opposition*|flexor-retinaculum trapezium-tubercle|metacarpal-1|superficial-palmar-arch|thenar|',
    'adductor-pollicis|adductor pollicis|musculus adductor pollicis|deep-ulnar@palm:C8 T1*|thumb-cmc.adduction*|capitate-bone metacarpal-2-base metacarpal-3|proximal-phalanx-thumb|deep-palmar-arch|hand-central|',
    'abductor-digiti-minimi|abductor digiti minimi|musculus abductor digiti minimi manus|deep-ulnar@hypothenar:C8 T1*|little-finger.abduction*|pisiform-bone|proximal-phalanx-5|ulnar-artery|hypothenar|',
    'flexor-digiti-minimi-brevis|flexor digiti minimi brevis|musculus flexor digiti minimi brevis manus|deep-ulnar@hypothenar:C8 T1*|little-finger.flexion*|hook-of-hamate flexor-retinaculum|proximal-phalanx-5|ulnar-artery|hypothenar|',
    'opponens-digiti-minimi|opponens digiti minimi|musculus opponens digiti minimi|deep-ulnar@hypothenar:C8 T1*|little-finger.opposition*|hook-of-hamate flexor-retinaculum|metacarpal-5|ulnar-artery|hypothenar|',
    'palmaris-brevis|palmaris brevis|musculus palmaris brevis|superficial-ulnar:C8 T1||palmar-aponeurosis flexor-retinaculum|hypothenar-skin|superficial-palmar-arch|hypothenar|',
    'lumbricals-hand|lumbricals of hand|musculi lumbricales manus|||fdp-tendons|extensor-expansions|superficial-palmar-arch deep-palmar-arch|hand-central|',
    'lumbricals-1-2|lumbricals 1 and 2|musculi lumbricales I et II|digital-median:C8 T1*|mcp.flexion* pip.extension* dip.extension|fdp-tendons|extensor-expansions|superficial-palmar-arch|hand-central|lumbricals-hand',
    'lumbricals-3-4|lumbricals 3 and 4|musculi lumbricales III et IV|deep-ulnar@palm:C8 T1*|mcp.flexion* pip.extension* dip.extension|fdp-tendons|extensor-expansions|deep-palmar-arch|hand-central|lumbricals-hand',
    'dorsal-interossei-hand|dorsal interossei of hand|musculi interossei dorsales manus|||metacarpals-sides|proximal-phalanges-2-4 extensor-expansions|deep-palmar-arch|hand-central|',
    'first-dorsal-interosseous|first dorsal interosseous|musculus interosseus dorsalis primus manus|deep-ulnar@palm:C8 T1*|mcp.abduction* mcp.flexion pip.extension|metacarpals-sides|proximal-phalanges-2-4 extensor-expansions|deep-palmar-arch|hand-central|dorsal-interossei-hand',
    'dorsal-interossei-2-4|dorsal interossei 2–4|musculi interossei dorsales II–IV manus|deep-ulnar@palm:C8 T1*|mcp.abduction* mcp.flexion pip.extension|metacarpals-sides|proximal-phalanges-2-4 extensor-expansions|deep-palmar-arch|hand-central|dorsal-interossei-hand',
    'palmar-interossei|palmar interossei|musculi interossei palmares|deep-ulnar@palm:C8 T1*|mcp.adduction* mcp.flexion pip.extension|metacarpals-sides|extensor-expansions|deep-palmar-arch|hand-central|',
    // thoracic and abdominal wall, diaphragm
    'diaphragm|diaphragm|diaphragma|phrenic@thorax:C3 C4* C5|breathing.inspiration*|||inferior-phrenic|thoracic-wall|',
    'intercostals|intercostal muscles|musculi intercostales|intercostal-nerves:T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11|breathing.inspiration|ribs-1-8|ribs-9-12|posterior-intercostal|thoracic-wall|',
    'rectus-abdominis|rectus abdominis|musculus rectus abdominis|intercostal-nerves:T7 T8 T9 T10 T11;subcostal:T12|trunk.flexion* trunk.compression|pubis-body|costal-cartilages-1-6|superior-epigastric inferior-epigastric|anterolateral-abdominal-wall|',
    'external-oblique|external oblique|musculus obliquus externus abdominis|intercostal-nerves:T7 T8 T9 T10 T11;subcostal:T12|trunk.flexion trunk.rotation* trunk.compression trunk.lateral-flexion|ribs-1-8|iliac-crest|posterior-intercostal|anterolateral-abdominal-wall|',
    'internal-oblique|internal oblique|musculus obliquus internus abdominis|intercostal-nerves:T7 T8 T9 T10 T11;subcostal:T12;iliohypogastric:L1;ilioinguinal:L1|trunk.flexion trunk.rotation* trunk.compression trunk.lateral-flexion|thoracolumbar-fascia iliac-crest|ribs-9-12|posterior-intercostal|anterolateral-abdominal-wall|',
    'transversus-abdominis|transversus abdominis|musculus transversus abdominis|intercostal-nerves:T7 T8 T9 T10 T11;subcostal:T12;iliohypogastric:L1;ilioinguinal:L1|trunk.compression*|thoracolumbar-fascia iliac-crest|pubis-body|posterior-intercostal|anterolateral-abdominal-wall|',
    'cremaster|cremaster|musculus cremaster|genital-branch-gf:L1 L2|perineum.testis-elevation*|||gonadal-artery|anterolateral-abdominal-wall|',
    'external-anal-sphincter|external anal sphincter|musculus sphincter ani externus|inferior-rectal:S2 S3 S4|perineum.anal-closure*|||inferior-rectal-artery|perineum-muscles|',
    'external-urethral-sphincter|external urethral sphincter|musculus sphincter urethrae externus|perineal-nerve:S2 S3 S4|perineum.urethral-closure*|||internal-pudendal|perineum-muscles|',
    'bulbospongiosus|bulbospongiosus|musculus bulbospongiosus|perineal-nerve:S2 S3 S4|perineum.urethral-emptying*|||internal-pudendal|perineum-muscles|',
    // hip and thigh
    'iliopsoas|iliopsoas|musculus iliopsoas|||iliac-fossa lumbar-transverse-processes vertebral-bodies-T12-L5|lesser-trochanter|iliolumbar lumbar-arteries|posterior-abdominal-wall|',
    'psoas-major|psoas major|musculus psoas major|psoas-branches:L1 L2* L3|hip.flexion* trunk.lateral-flexion|lumbar-transverse-processes vertebral-bodies-T12-L5|lesser-trochanter|lumbar-arteries|posterior-abdominal-wall|iliopsoas',
    'iliacus|iliacus|musculus iliacus|femoral@pelvis:L2 L3|hip.flexion*|iliac-fossa|lesser-trochanter|iliolumbar|posterior-abdominal-wall|iliopsoas',
    'pectineus|pectineus|musculus pectineus|femoral@inguinal-ligament:L2 L3|hip.adduction* hip.flexion|pectineal-line-pubis|pectineal-line-femur|medial-circumflex-femoral obturator-artery|medial-thigh|',
    'sartorius|sartorius|musculus sartorius|femoral@thigh:L2 L3|hip.flexion hip.abduction hip.lateral-rotation knee.flexion|asis|pes-anserinus|femoral-artery|anterior-thigh|',
    'quadriceps-femoris|quadriceps femoris|musculus quadriceps femoris|||aiis greater-trochanter linea-aspera intertrochanteric-line femur-anterior-shaft|patella-base tibial-tuberosity|lateral-circumflex-femoral profunda-femoris|anterior-thigh|',
    'rectus-femoris|rectus femoris|musculus rectus femoris|femoral@thigh:L2 L3* L4*|knee.extension* hip.flexion*|aiis|patella-base tibial-tuberosity|lateral-circumflex-femoral|anterior-thigh|quadriceps-femoris',
    'vastus-lateralis|vastus lateralis|musculus vastus lateralis|femoral@thigh:L2 L3* L4*|knee.extension*|greater-trochanter linea-aspera|patella-base tibial-tuberosity|lateral-circumflex-femoral|anterior-thigh|quadriceps-femoris',
    'vastus-medialis|vastus medialis|musculus vastus medialis|femoral@thigh:L2 L3* L4*|knee.extension*|intertrochanteric-line linea-aspera|patella-base tibial-tuberosity|femoral-artery profunda-femoris|anterior-thigh|quadriceps-femoris',
    'vastus-intermedius|vastus intermedius|musculus vastus intermedius|femoral@thigh:L2 L3* L4*|knee.extension*|femur-anterior-shaft|patella-base tibial-tuberosity|lateral-circumflex-femoral profunda-femoris|anterior-thigh|quadriceps-femoris',
    'gracilis|gracilis|musculus gracilis|obturator@thigh:L2 L3|hip.adduction knee.flexion|pubis-body inferior-pubic-ramus|pes-anserinus|profunda-femoris obturator-artery|medial-thigh|',
    'adductor-longus|adductor longus|musculus adductor longus|obturator@thigh:L2 L3 L4|hip.adduction*|pubis-body|linea-aspera|profunda-femoris obturator-artery|medial-thigh|',
    'adductor-brevis|adductor brevis|musculus adductor brevis|obturator@thigh:L2 L3 L4|hip.adduction*|pubis-body inferior-pubic-ramus|pectineal-line-femur linea-aspera|profunda-femoris obturator-artery|medial-thigh|',
    'adductor-magnus|adductor magnus|musculus adductor magnus|||ischiopubic-ramus ischial-tuberosity|gluteal-tuberosity linea-aspera adductor-tubercle|profunda-femoris obturator-artery|medial-thigh|',
    'adductor-magnus-adductor|adductor magnus, adductor part|pars adductoria musculi adductoris magni|obturator@thigh:L2 L3 L4|hip.adduction* hip.flexion|ischiopubic-ramus|gluteal-tuberosity linea-aspera|profunda-femoris obturator-artery|medial-thigh|adductor-magnus',
    'adductor-magnus-hamstring|adductor magnus, hamstring part|pars ischiocondylaris musculi adductoris magni|sciatic@thigh:L4|hip.extension hip.adduction|ischial-tuberosity|adductor-tubercle|perforating-arteries|medial-thigh|adductor-magnus',
    'obturator-externus|obturator externus|musculus obturatorius externus|obturator@thigh:L3 L4|hip.lateral-rotation*|obturator-membrane|trochanteric-fossa|obturator-artery|medial-thigh|',
    'gluteus-maximus|gluteus maximus|musculus gluteus maximus|inferior-gluteal:L5 S1* S2|hip.extension* hip.lateral-rotation*|ilium-posterior sacrum-dorsal sacrotuberous-ligament|iliotibial-tract gluteal-tuberosity|inferior-gluteal-artery superior-gluteal-artery|gluteal|',
    'gluteus-medius|gluteus medius|musculus gluteus medius|superior-gluteal:L4 L5* S1|hip.abduction* hip.medial-rotation*|ilium-gluteal-surface|greater-trochanter|superior-gluteal-artery|gluteal|',
    'gluteus-minimus|gluteus minimus|musculus gluteus minimus|superior-gluteal:L4 L5* S1|hip.abduction* hip.medial-rotation*|ilium-gluteal-surface|greater-trochanter|superior-gluteal-artery|gluteal|',
    'tensor-fasciae-latae|tensor fasciae latae|musculus tensor fasciae latae|superior-gluteal:L4 L5* S1|hip.abduction hip.medial-rotation hip.flexion|asis iliac-crest|iliotibial-tract|superior-gluteal-artery lateral-circumflex-femoral|gluteal|',
    'piriformis|piriformis|musculus piriformis|nerve-to-piriformis:S1 S2|hip.lateral-rotation* hip.abduction|sacrum-anterior|greater-trochanter|superior-gluteal-artery inferior-gluteal-artery|gluteal|',
    'obturator-internus|obturator internus|musculus obturatorius internus|nerve-to-obturator-internus:L5 S1 S2|hip.lateral-rotation*|obturator-membrane|greater-trochanter|internal-pudendal obturator-artery|gluteal|',
    'superior-gemellus|superior gemellus|musculus gemellus superior|nerve-to-obturator-internus:L5 S1 S2|hip.lateral-rotation*|ischial-spine|greater-trochanter|inferior-gluteal-artery|gluteal|',
    'inferior-gemellus|inferior gemellus|musculus gemellus inferior|nerve-to-quadratus-femoris:L4 L5 S1|hip.lateral-rotation*|ischial-tuberosity|greater-trochanter|medial-circumflex-femoral|gluteal|',
    'quadratus-femoris|quadratus femoris|musculus quadratus femoris|nerve-to-quadratus-femoris:L4 L5 S1|hip.lateral-rotation*|ischial-tuberosity|quadrate-tubercle|medial-circumflex-femoral|gluteal|',
    'semitendinosus|semitendinosus|musculus semitendinosus|sciatic@thigh:L5 S1 S2|knee.flexion* hip.extension* knee.medial-rotation|ischial-tuberosity|pes-anserinus|perforating-arteries|posterior-thigh|',
    'semimembranosus|semimembranosus|musculus semimembranosus|sciatic@thigh:L5 S1 S2|knee.flexion* hip.extension* knee.medial-rotation|ischial-tuberosity|medial-tibial-condyle|perforating-arteries|posterior-thigh|',
    'biceps-femoris|biceps femoris|musculus biceps femoris|||ischial-tuberosity linea-aspera|fibular-head|perforating-arteries|posterior-thigh|',
    'biceps-femoris-long|biceps femoris, long head|caput longum musculi bicipitis femoris|sciatic@thigh:L5 S1 S2|knee.flexion* hip.extension* knee.lateral-rotation|ischial-tuberosity|fibular-head|perforating-arteries|posterior-thigh|biceps-femoris',
    'biceps-femoris-short|biceps femoris, short head|caput breve musculi bicipitis femoris|sciatic@thigh:L5 S1 S2|knee.flexion*|linea-aspera|fibular-head|perforating-arteries|posterior-thigh|biceps-femoris',
    // leg
    'tibialis-anterior|tibialis anterior|musculus tibialis anterior|deep-fibular@leg:L4* L5|ankle.dorsiflexion* subtalar.inversion*|lateral-tibial-condyle tibia-lateral-surface interosseous-membrane-leg|medial-cuneiform metatarsal-1-base|anterior-tibial|anterior-leg|',
    'extensor-hallucis-longus|extensor hallucis longus|musculus extensor hallucis longus|deep-fibular@leg:L5* S1|hallux.extension* ankle.dorsiflexion|fibula-anterior interosseous-membrane-leg|distal-phalanx-hallux|anterior-tibial|anterior-leg|',
    'extensor-digitorum-longus|extensor digitorum longus|musculus extensor digitorum longus|deep-fibular@leg:L5* S1|toes.extension* ankle.dorsiflexion|lateral-tibial-condyle fibula-anterior|phalanges-2-5-foot|anterior-tibial|anterior-leg|',
    'fibularis-tertius|fibularis tertius|musculus fibularis tertius|deep-fibular@leg:L5* S1|ankle.dorsiflexion subtalar.eversion|fibula-anterior|metatarsal-5-base|anterior-tibial|anterior-leg|',
    'fibularis-longus|fibularis (peroneus) longus|musculus fibularis longus|superficial-fibular@leg:L5 S1* S2|subtalar.eversion* ankle.plantarflexion|fibular-head fibula-lateral|metatarsal-1-base medial-cuneiform|fibular-artery anterior-tibial|lateral-leg|',
    'fibularis-brevis|fibularis (peroneus) brevis|musculus fibularis brevis|superficial-fibular@leg:L5 S1* S2|subtalar.eversion* ankle.plantarflexion|fibula-lateral|metatarsal-5-tuberosity|fibular-artery anterior-tibial|lateral-leg|',
    'gastrocnemius|gastrocnemius|musculus gastrocnemius|tibial@popliteal:S1* S2|ankle.plantarflexion* knee.flexion|femoral-condyles-posterior|calcaneal-tuberosity|sural-arteries|posterior-leg|',
    'soleus|soleus|musculus soleus|tibial@popliteal:S1* S2|ankle.plantarflexion*|fibular-head soleal-line|calcaneal-tuberosity|sural-arteries posterior-tibial fibular-artery|posterior-leg|',
    'plantaris|plantaris|musculus plantaris|tibial@popliteal:S1 S2|ankle.plantarflexion knee.flexion|lateral-supracondylar-line|calcaneal-tuberosity|sural-arteries|posterior-leg|',
    'popliteus|popliteus|musculus popliteus|tibial@popliteal:L4 L5 S1|knee.medial-rotation* knee.flexion|lateral-femoral-condyle|tibia-posterior-proximal|genicular-arteries|posterior-leg|',
    'tibialis-posterior|tibialis posterior|musculus tibialis posterior|tibial@leg:L4 L5*|subtalar.inversion* ankle.plantarflexion|interosseous-membrane-leg tibia-posterior fibula-posterior|navicular-tuberosity medial-cuneiform cuboid-bone metatarsals-2-4-bases|fibular-artery posterior-tibial|posterior-leg|',
    'flexor-digitorum-longus|flexor digitorum longus|musculus flexor digitorum longus|tibial@leg:S2 S3|toes.flexion* ankle.plantarflexion subtalar.inversion|tibia-posterior|phalanges-2-5-foot|posterior-tibial|posterior-leg|',
    'flexor-hallucis-longus|flexor hallucis longus|musculus flexor hallucis longus|tibial@leg:S2 S3|hallux.flexion* ankle.plantarflexion subtalar.inversion|fibula-posterior interosseous-membrane-leg|distal-phalanx-hallux|fibular-artery|posterior-leg|',
    // foot
    'extensor-digitorum-brevis|extensor digitorum brevis|musculus extensor digitorum brevis|deep-fibular@ankle:L5 S1|toes.extension|calcaneus-superolateral|extensor-expansions-foot|dorsalis-pedis|foot-dorsum|',
    'extensor-hallucis-brevis|extensor hallucis brevis|musculus extensor hallucis brevis|deep-fibular@ankle:L5 S1|hallux.extension|calcaneus-superolateral|proximal-phalanx-hallux|dorsalis-pedis|foot-dorsum|',
    'abductor-hallucis|abductor hallucis|musculus abductor hallucis|medial-plantar:S2 S3|hallux.abduction* hallux.flexion|calcaneal-tuberosity flexor-retinaculum|proximal-phalanx-hallux|medial-plantar-artery|sole|',
    'flexor-digitorum-brevis|flexor digitorum brevis|musculus flexor digitorum brevis|medial-plantar:S2 S3|toes.flexion|calcaneal-tuberosity|phalanges-2-5-foot|medial-plantar-artery lateral-plantar-artery|sole|',
    'flexor-hallucis-brevis|flexor hallucis brevis|musculus flexor hallucis brevis|medial-plantar:S2 S3|hallux.flexion|cuboid-bone lateral-cuneiform|proximal-phalanx-hallux|medial-plantar-artery|sole|',
    'lumbrical-1-foot|first lumbrical of foot|musculus lumbricalis I pedis|medial-plantar:S2 S3|toes.flexion|fdl-tendon|extensor-expansions-foot|plantar-arch|sole|',
    'abductor-digiti-minimi-foot|abductor digiti minimi of foot|musculus abductor digiti minimi pedis|lateral-plantar:S2 S3|toes.abduction toes.flexion|calcaneal-tuberosity|proximal-phalanx-5-foot|lateral-plantar-artery|sole|',
    'quadratus-plantae|quadratus plantae|musculus quadratus plantae|lateral-plantar:S2 S3|toes.flexion|calcaneus-plantar|fdl-tendon|lateral-plantar-artery|sole|',
    'flexor-digiti-minimi-foot|flexor digiti minimi brevis of foot|musculus flexor digiti minimi brevis pedis|lateral-plantar:S2 S3|toes.flexion|metatarsal-5-base|proximal-phalanx-5-foot|lateral-plantar-artery|sole|',
    'adductor-hallucis|adductor hallucis|musculus adductor hallucis|lateral-plantar:S2 S3|hallux.adduction*|metatarsals-2-4-bases|proximal-phalanx-hallux|plantar-arch|sole|',
    'lumbricals-2-4-foot|lumbricals 2–4 of foot|musculi lumbricales II–IV pedis|lateral-plantar:S2 S3|toes.flexion|fdl-tendon|extensor-expansions-foot|plantar-arch|sole|',
    'interossei-foot|interossei of foot|musculi interossei pedis|lateral-plantar:S2 S3|toes.abduction* toes.adduction* toes.flexion|metatarsals-shafts|proximal-phalanges-2-5-foot|plantar-arch|sole|',
    // head and neck (attachments and arteries of these are not curated: queries on them report `uncurated`)
    'levator-palpebrae|levator palpebrae superioris|musculus levator palpebrae superioris|oculomotor-superior:|eyelid.elevation*||||extraocular|',
    'superior-rectus|superior rectus|musculus rectus superior|oculomotor-superior:|eye.elevation* eye.adduction eye.intorsion||||extraocular|',
    'medial-rectus|medial rectus|musculus rectus medialis|oculomotor-inferior:|eye.adduction*||||extraocular|',
    'inferior-rectus|inferior rectus|musculus rectus inferior|oculomotor-inferior:|eye.depression* eye.adduction eye.extorsion||||extraocular|',
    'inferior-oblique|inferior oblique|musculus obliquus inferior|oculomotor-inferior:|eye.extorsion* eye.elevation eye.abduction||||extraocular|',
    'superior-oblique|superior oblique|musculus obliquus superior|trochlear:|eye.intorsion* eye.depression eye.abduction||||extraocular|',
    'lateral-rectus|lateral rectus|musculus rectus lateralis|abducens:|eye.abduction*||||extraocular|',
    'sphincter-pupillae|sphincter pupillae|musculus sphincter pupillae|oculomotor-inferior:|pupil.constriction*||||intrinsic-eye|',
    'ciliary-muscle|ciliary muscle|musculus ciliaris|oculomotor-inferior:|lens.accommodation*||||intrinsic-eye|',
    'dilator-pupillae|dilator pupillae|musculus dilatator pupillae|oculosympathetic:T1|pupil.dilation*||||intrinsic-eye|',
    'superior-tarsal|superior tarsal muscle|musculus tarsalis superior|oculosympathetic:T1|eyelid.elevation||||intrinsic-eye|',
    'masseter|masseter|musculus masseter|mandibular@infratemporal:|tmj.elevation*|zygomatic-arch|mandible-angle||mastication|',
    'temporalis|temporalis|musculus temporalis|mandibular@infratemporal:|tmj.elevation* tmj.retrusion*|temporal-fossa|coronoid-process-mandible||mastication|',
    'medial-pterygoid|medial pterygoid|musculus pterygoideus medialis|mandibular@infratemporal:|tmj.elevation* tmj.protrusion tmj.lateral-deviation||mandible-angle||mastication|',
    'lateral-pterygoid|lateral pterygoid|musculus pterygoideus lateralis|mandibular@infratemporal:|tmj.protrusion* tmj.depression* tmj.lateral-deviation*||||mastication|',
    'tensor-tympani|tensor tympani|musculus tensor tympani|mandibular@infratemporal:|middle-ear.damping||||middle-ear-muscles|',
    'tensor-veli-palatini|tensor veli palatini|musculus tensor veli palatini|mandibular@infratemporal:|palate.tension*||||pharynx-palate|',
    'mylohyoid|mylohyoid|musculus mylohyoideus|inferior-alveolar:|neck-hyoid.elevation tmj.depression||||neck-muscles|',
    'digastric-anterior|digastric, anterior belly|venter anterior musculi digastrici|inferior-alveolar:|tmj.depression neck-hyoid.elevation||||neck-muscles|',
    'frontalis|frontal belly of occipitofrontalis|venter frontalis musculi occipitofrontalis|facial-temporal:|face.brow-raise*||||facial-expression|',
    'orbicularis-oculi|orbicularis oculi|musculus orbicularis oculi|facial-temporal:=0.5;facial-zygomatic:=0.5|eyelid.closure*||||facial-expression|',
    'zygomaticus-major|zygomaticus major|musculus zygomaticus major|facial-zygomatic:|face.smile*||||facial-expression|',
    'buccinator|buccinator|musculus buccinator|facial-buccal:|face.cheek-compression*||||facial-expression|',
    'orbicularis-oris|orbicularis oris|musculus orbicularis oris|facial-buccal:=0.5;facial-marginal:=0.5|face.lip-closure*||||facial-expression|',
    'depressor-anguli-oris|depressor anguli oris|musculus depressor anguli oris|facial-marginal:|face.mouth-depression*||||facial-expression|',
    'platysma|platysma|platysma|facial-cervical:|face.neck-skin*||||facial-expression|',
    'stapedius|stapedius|musculus stapedius|nerve-to-stapedius:|middle-ear.damping*||||middle-ear-muscles|',
    'digastric-posterior|digastric, posterior belly|venter posterior musculi digastrici|facial@stylomastoid:|neck-hyoid.elevation tmj.depression|mastoid-process|||neck-muscles|',
    'stylohyoid|stylohyoid|musculus stylohyoideus|facial@stylomastoid:|neck-hyoid.elevation||||neck-muscles|',
    'stylopharyngeus|stylopharyngeus|musculus stylopharyngeus|glossopharyngeal@neck:|pharynx.elevation*||||pharynx-palate|',
    'pharyngeal-constrictors|pharyngeal constrictors|musculi constrictores pharyngis|pharyngeal-vagus:|pharynx.constriction*||||pharynx-palate|',
    'levator-veli-palatini|levator veli palatini|musculus levator veli palatini|pharyngeal-vagus:|palate.elevation*||||pharynx-palate|',
    'palatoglossus|palatoglossus|musculus palatoglossus|pharyngeal-vagus:|tongue.elevation||||tongue-muscles|',
    'cricothyroid|cricothyroid|musculus cricothyroideus|external-laryngeal:|larynx.tension*||||larynx-muscles|',
    'posterior-cricoarytenoid|posterior crico-arytenoid|musculus cricoarytenoideus posterior|recurrent-laryngeal:|larynx.abduction*||||larynx-muscles|',
    'lateral-cricoarytenoid|lateral crico-arytenoid|musculus cricoarytenoideus lateralis|recurrent-laryngeal:|larynx.adduction*||||larynx-muscles|',
    'thyroarytenoid|thyro-arytenoid (vocalis)|musculus thyroarytenoideus|recurrent-laryngeal:|larynx.adduction larynx.tension||||larynx-muscles|',
    'sternocleidomastoid|sternocleidomastoid|musculus sternocleidomastoideus|accessory@neck:|cervical-spine.rotation* cervical-spine.flexion* cervical-spine.lateral-flexion|manubrium clavicle-medial-half|mastoid-process superior-nuchal-line||neck-muscles|',
    'genioglossus|genioglossus|musculus genioglossus|hypoglossal@neck:|tongue.protrusion*||||tongue-muscles|',
    'hyoglossus|hyoglossus|musculus hyoglossus|hypoglossal@neck:|tongue.retraction*||||tongue-muscles|',
    'styloglossus|styloglossus|musculus styloglossus|hypoglossal@neck:|tongue.retraction tongue.elevation||||tongue-muscles|',
    'infrahyoid-muscles|infrahyoid muscles (sternohyoid, sternothyroid, omohyoid)|musculi infrahyoidei|ansa-cervicalis:C1 C2 C3|neck-hyoid.depression*||||neck-muscles|',
  ],
  /* skin areas (cutaneous territories of nerves; Moore9 figs 3.x, 7.x): id|en|innervation */
  areas: [
    'occipital-scalp|skin of the back of the scalp|greater-occipital:C2',
    'lesser-occipital-skin|skin behind the ear|lesser-occipital:C2',
    'great-auricular-skin|skin over the parotid and the auricle|great-auricular:C2 C3',
    'anterior-neck-skin|skin of the anterior neck|transverse-cervical-nerve:C2 C3',
    'supraclavicular-skin|skin over the clavicle and the shoulder|supraclavicular-nerves:C3 C4',
    'forehead|skin of the forehead and the upper eyelid|ophthalmic@orbit:',
    'cornea|cornea|ophthalmic@orbit:',
    'cheek|skin of the cheek, the lower eyelid and the upper lip|maxillary@face:',
    'chin-lower-lip|skin of the chin and the lower lip|inferior-alveolar:',
    'temple-auricle|skin of the temple and in front of the ear|mandibular@infratemporal:',
    'anterior-tongue|general sensation of the anterior two thirds of the tongue|lingual:',
    'pharynx-posterior-tongue|posterior third of the tongue and the oropharynx|glossopharyngeal@neck:',
    'larynx-above-folds|laryngeal mucosa above the vocal folds|internal-laryngeal:',
    'regimental-badge|skin over the lower deltoid (regimental badge)|superior-lateral-cutaneous-arm:C5 C6',
    'lower-lateral-arm|skin of the lower lateral arm|inferior-lateral-cutaneous-arm:C5 C6',
    'posterior-arm-skin|skin of the back of the arm|posterior-cutaneous-arm:C5 C6 C7 C8',
    'posterior-forearm-skin|skin of the back of the forearm|posterior-cutaneous-forearm:C6 C7 C8',
    'medial-arm|skin of the medial arm|medial-cutaneous-arm:T1;intercostobrachial:T2',
    'medial-forearm|skin of the medial forearm|medial-cutaneous-forearm:C8 T1',
    'lateral-forearm|skin of the lateral forearm|lateral-cutaneous-forearm:C5 C6',
    'dorsum-radial-hand|dorsum of the radial hand and the first web space|superficial-radial:C6 C7',
    'thenar-skin|skin over the thenar eminence|palmar-cutaneous-median:C6 C7',
    'palmar-lateral-digits|palmar skin of the lateral three and a half digits|digital-median:C6 C7 C8',
    'hypothenar-skin-area|skin over the hypothenar eminence|palmar-cutaneous-ulnar:C8',
    'dorsal-ulnar-hand|dorsum of the ulnar hand|dorsal-cutaneous-ulnar:C8',
    'palmar-ulnar-digits|palmar skin of the medial one and a half digits|superficial-ulnar:C8',
    'chest-abdomen-skin|skin of the chest and the abdominal wall|intercostal-nerves:T2 T3 T4 T5 T6 T7 T8 T9 T10 T11;subcostal:T12',
    'hypogastric-skin|suprapubic and lateral gluteal skin|iliohypogastric:T12 L1',
    'groin-skin|skin of the groin, the root of the penis or mons and the anterior scrotum or labium|ilioinguinal:L1',
    'femoral-triangle-skin|skin over the femoral triangle|femoral-branch-gf:L1 L2',
    'lateral-thigh|skin of the lateral thigh|lateral-cutaneous-thigh@inguinal-ligament:L2 L3',
    'anterior-thigh-skin|skin of the anterior thigh|anterior-cutaneous-thigh:L2 L3',
    'medial-thigh-skin|skin of the medial thigh|obturator@thigh:L2 L3 L4',
    'medial-leg|skin of the medial leg and the medial foot|saphenous:L3 L4',
    'posterior-thigh-skin|skin of the back of the thigh|posterior-cutaneous-thigh:S1 S2 S3',
    'lateral-leg-upper|skin of the upper lateral leg|lateral-sural-cutaneous:L5 S1',
    'lateral-foot|skin of the lateral foot and the lateral heel|sural:S1 S2',
    'dorsum-foot|skin of the lower lateral leg and the dorsum of the foot|superficial-fibular@ankle:L4 L5 S1',
    'first-web-dorsal|skin of the first web space of the foot|deep-fibular@ankle:L5',
    'heel|skin of the heel|medial-calcaneal:S1 S2',
    'sole-medial|skin of the medial sole|medial-plantar:L4 L5',
    'sole-lateral|skin of the lateral sole|lateral-plantar:S1 S2',
    'perineum-skin|skin of the perineum|perineal-nerve:S2 S3 S4',
    'perianal-skin|perianal skin|inferior-rectal:S3 S4',
    'genital-skin|skin of the penis or clitoris|dorsal-nerve-penis:S2 S3 S4',
  ],
  /* special senses and visceral functions: id|en|innervation */
  fns: [
    'smell|smell|olfactory:',
    'vision|vision of this eye|optic:',
    'lacrimation|lacrimation (lacrimal gland)|greater-petrosal:',
    'taste-anterior|taste of the anterior two thirds of the tongue|chorda-tympani:',
    'salivation-submandibular|submandibular and sublingual salivation|chorda-tympani:',
    'salivation-parotid|parotid salivation (lesser petrosal)|glossopharyngeal@jugular-foramen:',
    'taste-posterior|taste of the posterior third of the tongue|glossopharyngeal@neck:',
    'carotid-sinus|carotid sinus and body afferents|glossopharyngeal@neck:',
    'hearing|hearing|vestibulocochlear:',
    'balance|balance (vestibular)|vestibulocochlear:',
    'vagal-viscera|vagal supply of heart, lungs and gut|vagus@thorax:',
    'facial-sweating|sweating of the face|oculosympathetic@superior-cervical-ganglion:T1',
  ],
  /* reflexes: id|en|kind|muscles (efferent)|roots (spinal)|afferent (nerve@level, cranial and cutaneous reflexes)
       (Moore9; Bickerstaff's Neurological Examination; research C1.7: textbook root ranges vary) */
  reflexes: [
    'biceps-reflex|biceps reflex|spinal|biceps-brachii|C5 C6|',
    'brachioradialis-reflex|brachioradialis reflex|spinal|brachioradialis|C5 C6*|',
    'triceps-reflex|triceps reflex|spinal|triceps-long triceps-lateral triceps-medial|C6 C7* C8|',
    'finger-flexor-reflex|finger flexor reflex|spinal|fdp-lateral fdp-medial flexor-digitorum-superficialis|C8|',
    'patellar-reflex|patellar (knee) reflex|spinal|rectus-femoris vastus-lateralis vastus-medialis vastus-intermedius|L2 L3 L4*|',
    'adductor-reflex|adductor reflex|spinal|adductor-longus adductor-brevis adductor-magnus-adductor|L2 L3 L4|',
    'achilles-reflex|Achilles (ankle) reflex|spinal|gastrocnemius soleus|S1* S2|',
    'abdominal-upper-reflex|upper abdominal reflex|spinal|rectus-abdominis external-oblique internal-oblique|T8 T9 T10|intercostal-nerves',
    'abdominal-lower-reflex|lower abdominal reflex|spinal|rectus-abdominis external-oblique internal-oblique|T10 T11 T12|intercostal-nerves',
    'cremasteric-reflex|cremasteric reflex|spinal|cremaster|L1 L2|femoral-branch-gf',
    'anal-wink-reflex|anal wink|spinal|external-anal-sphincter|S2 S3 S4|inferior-rectal',
    'bulbocavernosus-reflex|bulbocavernosus reflex|spinal|bulbospongiosus|S2 S3 S4|dorsal-nerve-penis',
    'jaw-jerk-reflex|jaw jerk|cranial|masseter||mandibular@infratemporal',
    'corneal-reflex|corneal reflex|cranial|orbicularis-oculi||ophthalmic@orbit',
    'gag-reflex|gag reflex|cranial|pharyngeal-constrictors||glossopharyngeal@neck',
    'pupillary-light-reflex|pupillary light reflex (direct)|cranial|sphincter-pupillae||optic',
    'acoustic-reflex|acoustic (stapedius) reflex|cranial|stapedius||vestibulocochlear',
  ],
  /* lesion sites: id|en|kind|nerve@level passing|vessels passing (Moore9; Gray42) */
  sites: [
    'cribriform-plate|cribriform plate|foramen|olfactory@cribriform-plate|',
    'optic-canal|optic canal|foramen|optic@optic-canal|ophthalmic-artery',
    'superior-orbital-fissure|superior orbital fissure|foramen|oculomotor@sof trochlear@sof ophthalmic@sof abducens@sof|superior-ophthalmic-vein',
    'foramen-rotundum|foramen rotundum|foramen|maxillary@foramen-rotundum|',
    'foramen-ovale|foramen ovale|foramen|mandibular@foramen-ovale|',
    'foramen-spinosum|foramen spinosum|foramen||middle-meningeal',
    'internal-acoustic-meatus|internal acoustic meatus|foramen|facial@iam vestibulocochlear@iam|',
    'stylomastoid-foramen|stylomastoid foramen|foramen|facial@stylomastoid|',
    'jugular-foramen|jugular foramen|foramen|glossopharyngeal@jugular-foramen vagus@jugular-foramen accessory@jugular-foramen|internal-jugular-vein',
    'hypoglossal-canal|hypoglossal canal|foramen|hypoglossal@hypoglossal-canal|',
    'foramen-magnum|foramen magnum|foramen||vertebral',
    'cavernous-sinus|cavernous sinus|site|oculomotor@cavernous-sinus trochlear@cavernous-sinus ophthalmic@cavernous-sinus maxillary@cavernous-sinus abducens@cavernous-sinus oculosympathetic@cavernous-sinus|internal-carotid',
    'cerebellopontine-angle|cerebellopontine angle|site|facial@cpa vestibulocochlear@cpa trigeminal@cpa|',
    'carpal-tunnel|carpal tunnel|site|median@carpal-tunnel|',
    'guyon-canal|ulnar (Guyon) canal|site|ulnar@guyon|ulnar-artery',
    'cubital-tunnel|cubital tunnel (medial epicondyle)|site|ulnar@elbow|',
    'spiral-groove|radial (spiral) groove|site|radial@spiral-groove|profunda-brachii',
    'quadrangular-space|quadrangular space|site|axillary@quadrangular-space|posterior-circumflex-humeral',
    'supinator-arcade|supinator arcade (of Frohse)|site|deep-radial@supinator|',
    'suprascapular-notch|suprascapular notch|site|suprascapular@suprascapular-notch|',
    'spinoglenoid-notch|spinoglenoid notch|site|suprascapular@spinoglenoid-notch|',
    'fibular-neck|neck of fibula|site|common-fibular@fibular-neck|',
    'tarsal-tunnel|tarsal tunnel|site|tibial@tarsal-tunnel|posterior-tibial',
    'obturator-canal|obturator canal|foramen|obturator@obturator-canal|obturator-artery',
    'inguinal-ligament-lateral|lateral end of the inguinal ligament|site|lateral-cutaneous-thigh@inguinal-ligament|',
    'infrapiriform-foramen|greater sciatic foramen below piriformis|foramen|sciatic@gluteal inferior-gluteal posterior-cutaneous-thigh pudendal@pelvis nerve-to-obturator-internus nerve-to-quadratus-femoris|inferior-gluteal-artery internal-pudendal',
    'suprapiriform-foramen|greater sciatic foramen above piriformis|foramen|superior-gluteal|superior-gluteal-artery',
    'pudendal-canal|pudendal canal|site|pudendal@pudendal-canal|internal-pudendal',
    'cervical-sympathetic-trunk|cervical sympathetic trunk|site|oculosympathetic@cervical-chain|',
    'posterior-triangle|posterior triangle of the neck|site|accessory@posterior-triangle|',
  ],
  /* ISNCSCI 2019 (ASIA/ISCoS; Rupp R et al., Top Spinal Cord Inj Rehabil 2021;27(2):1): key sensory points and key muscle functions */
  keyPoints: [
    'C2|at least 1 cm lateral to the occipital protuberance',
    'C3|supraclavicular fossa at the midclavicular line',
    'C4|over the acromioclavicular joint',
    'C5|lateral side of the antecubital fossa',
    'C6|thumb, dorsal surface of the proximal phalanx',
    'C7|middle finger, dorsal surface of the proximal phalanx',
    'C8|little finger, dorsal surface of the proximal phalanx',
    'T1|medial side of the antecubital fossa',
    'T2|apex of the axilla',
    'T3|midclavicular line, 3rd intercostal space',
    'T4|4th intercostal space (nipple line)',
    'T5|midclavicular line, 5th intercostal space',
    'T6|midclavicular line, 6th intercostal space (xiphisternum)',
    'T7|midclavicular line, 7th intercostal space',
    'T8|midclavicular line, 8th intercostal space',
    'T9|midclavicular line, 9th intercostal space',
    'T10|10th intercostal space (umbilicus)',
    'T11|midclavicular line, 11th intercostal space',
    'T12|midpoint of the inguinal ligament',
    'L1|halfway between T12 and L2',
    'L2|anteromedial thigh, midway between the inguinal ligament and the medial femoral condyle',
    'L3|medial femoral condyle',
    'L4|medial malleolus',
    'L5|dorsum of the foot at the third metatarsophalangeal joint',
    'S1|lateral heel (calcaneus)',
    'S2|midline of the popliteal fossa',
    'S3|ischial tuberosity or infragluteal fold',
    'S4|perianal area, less than 1 cm lateral to the mucocutaneous junction',
    'S5|perianal area, less than 1 cm lateral to the mucocutaneous junction',
  ],
  keyMuscles: [
    'C5|elbow.flexion',
    'C6|wrist.extension',
    'C7|elbow.extension',
    'C8|dip.flexion',
    'T1|little-finger.abduction',
    'L2|hip.flexion',
    'L3|knee.extension',
    'L4|ankle.dorsiflexion',
    'L5|hallux.extension',
    'S1|ankle.plantarflexion',
  ],
  /* heart, arteries and capillary beds: id|en|la|type|from ("x" a branch of x, "x>" the continuation of x, "/R" "/L" on one side only)
       (Moore9 ch. 1, 3, 4, 5, 7, 8; Gray42) */
  arteries: [
    'right-atrium|right atrium|atrium dextrum|heart|vena-cava-superior> vena-cava-inferior> coronary-sinus>',
    'tricuspid-valve|tricuspid valve|valva atrioventricularis dextra|heart|right-atrium>',
    'right-ventricle|right ventricle|ventriculus dexter|heart|tricuspid-valve>',
    'pulmonary-valve|pulmonary valve|valva trunci pulmonalis|heart|right-ventricle>',
    'pulmonary-trunk|pulmonary trunk|truncus pulmonalis|artery|pulmonary-valve>',
    'pulmonary-arteries|right and left pulmonary arteries|arteriae pulmonales|artery|pulmonary-trunk>',
    'lung-capillaries|pulmonary capillaries|rete capillare pulmonis|bed|pulmonary-arteries>',
    'pulmonary-veins|pulmonary veins|venae pulmonales|vein|lung-capillaries>',
    'left-atrium|left atrium|atrium sinistrum|heart|pulmonary-veins>',
    'mitral-valve|mitral valve|valva atrioventricularis sinistra|heart|left-atrium>',
    'left-ventricle|left ventricle|ventriculus sinister|heart|mitral-valve>',
    'aortic-valve|aortic valve|valva aortae|heart|left-ventricle>',
    'ascending-aorta|ascending aorta|pars ascendens aortae|artery|aortic-valve>',
    'aortic-arch|arch of aorta|arcus aortae|artery|ascending-aorta>',
    'thoracic-aorta|thoracic aorta|pars thoracica aortae|artery|aortic-arch>',
    'abdominal-aorta|abdominal aorta|pars abdominalis aortae|artery|thoracic-aorta>',
    // coronary
    'right-coronary|right coronary artery|arteria coronaria dextra|artery|ascending-aorta',
    'sa-nodal|sinu-atrial nodal branch|ramus nodi sinuatrialis|artery|right-coronary',
    'right-marginal|right marginal branch|ramus marginalis dexter|artery|right-coronary',
    'posterior-interventricular|posterior interventricular branch (PDA)|ramus interventricularis posterior|artery|right-coronary',
    'av-nodal|atrioventricular nodal branch|ramus nodi atrioventricularis|artery|right-coronary',
    'left-coronary|left coronary artery|arteria coronaria sinistra|artery|ascending-aorta',
    'anterior-interventricular|anterior interventricular branch (LAD)|ramus interventricularis anterior|artery|left-coronary',
    'diagonal|diagonal branches|rami diagonales|artery|anterior-interventricular',
    'circumflex|circumflex branch|ramus circumflexus|artery|left-coronary',
    'obtuse-marginal|left marginal (obtuse marginal) branch|ramus marginalis sinister|artery|circumflex',
    'myocardium|myocardial capillaries|rete capillare myocardii|bed|right-marginal> posterior-interventricular> anterior-interventricular> diagonal> obtuse-marginal> sa-nodal> av-nodal>',
    // arch and neck
    'brachiocephalic-trunk|brachiocephalic trunk|truncus brachiocephalicus|artery|aortic-arch',
    'common-carotid|common carotid artery|arteria carotis communis|artery|brachiocephalic-trunk/R aortic-arch/L',
    'subclavian|subclavian artery|arteria subclavia|artery|brachiocephalic-trunk/R aortic-arch/L',
    'internal-carotid|internal carotid artery|arteria carotis interna|artery|common-carotid',
    'external-carotid|external carotid artery|arteria carotis externa|artery|common-carotid',
    'superior-thyroid|superior thyroid artery|arteria thyroidea superior|artery|external-carotid',
    'ascending-pharyngeal|ascending pharyngeal artery|arteria pharyngea ascendens|artery|external-carotid',
    'lingual-artery|lingual artery|arteria lingualis|artery|external-carotid',
    'facial-artery|facial artery|arteria facialis|artery|external-carotid',
    'occipital-artery|occipital artery|arteria occipitalis|artery|external-carotid',
    'posterior-auricular|posterior auricular artery|arteria auricularis posterior|artery|external-carotid',
    'maxillary-artery|maxillary artery|arteria maxillaris|artery|external-carotid',
    'middle-meningeal|middle meningeal artery|arteria meningea media|artery|maxillary-artery',
    'superficial-temporal|superficial temporal artery|arteria temporalis superficialis|artery|external-carotid>',
    'ophthalmic-artery|ophthalmic artery|arteria ophthalmica|artery|internal-carotid',
    'posterior-communicating|posterior communicating artery|arteria communicans posterior|artery|internal-carotid',
    'anterior-cerebral|anterior cerebral artery|arteria cerebri anterior|artery|internal-carotid',
    'middle-cerebral|middle cerebral artery|arteria cerebri media|artery|internal-carotid>',
    'anterior-communicating|anterior communicating artery|arteria communicans anterior|artery|anterior-cerebral',
    'vertebral|vertebral artery|arteria vertebralis|artery|subclavian',
    'basilar|basilar artery|arteria basilaris|artery|vertebral>',
    'posterior-inferior-cerebellar|posterior inferior cerebellar artery|arteria inferior posterior cerebelli|artery|vertebral',
    'anterior-spinal|anterior spinal artery|arteria spinalis anterior|artery|vertebral',
    'anterior-inferior-cerebellar|anterior inferior cerebellar artery|arteria inferior anterior cerebelli|artery|basilar',
    'superior-cerebellar|superior cerebellar artery|arteria superior cerebelli|artery|basilar',
    'posterior-cerebral|posterior cerebral artery|arteria cerebri posterior|artery|basilar>',
    'brain-capillaries|cerebral capillaries|rete capillare cerebri|bed|anterior-cerebral> middle-cerebral> posterior-cerebral>',
    'internal-thoracic|internal thoracic artery|arteria thoracica interna|artery|subclavian',
    'superior-epigastric|superior epigastric artery|arteria epigastrica superior|artery|internal-thoracic>',
    'thyrocervical-trunk|thyrocervical trunk|truncus thyrocervicalis|artery|subclavian',
    'inferior-thyroid|inferior thyroid artery|arteria thyroidea inferior|artery|thyrocervical-trunk',
    'suprascapular-artery|suprascapular artery|arteria suprascapularis|artery|thyrocervical-trunk',
    'transverse-cervical-artery|transverse cervical artery|arteria transversa colli|artery|thyrocervical-trunk',
    'costocervical-trunk|costocervical trunk|truncus costocervicalis|artery|subclavian',
    'dorsal-scapular-artery|dorsal scapular artery|arteria dorsalis scapulae|artery|subclavian',
    // upper limb: the axillary artery in three parts (relative to pectoralis minor), the brachial artery from the lower border of teres major
    'axillary-1|axillary artery, first part|arteria axillaris (pars prima)|artery|subclavian>',
    'superior-thoracic|superior thoracic artery|arteria thoracica superior|artery|axillary-1',
    'axillary-2|axillary artery, second part|arteria axillaris (pars secunda)|artery|axillary-1>',
    'thoracoacromial|thoraco-acromial artery|arteria thoracoacromialis|artery|axillary-2',
    'lateral-thoracic|lateral thoracic artery|arteria thoracica lateralis|artery|axillary-2',
    'axillary-3|axillary artery, third part|arteria axillaris (pars tertia)|artery|axillary-2>',
    'subscapular-artery|subscapular artery|arteria subscapularis|artery|axillary-3',
    'circumflex-scapular|circumflex scapular artery|arteria circumflexa scapulae|artery|subscapular-artery',
    'thoracodorsal-artery|thoracodorsal artery|arteria thoracodorsalis|artery|subscapular-artery>',
    'anterior-circumflex-humeral|anterior circumflex humeral artery|arteria circumflexa humeri anterior|artery|axillary-3',
    'posterior-circumflex-humeral|posterior circumflex humeral artery|arteria circumflexa humeri posterior|artery|axillary-3',
    'brachial|brachial artery|arteria brachialis|artery|axillary-3>',
    'profunda-brachii|deep artery of arm|arteria profunda brachii|artery|brachial',
    'superior-ulnar-collateral|superior ulnar collateral artery|arteria collateralis ulnaris superior|artery|brachial',
    'inferior-ulnar-collateral|inferior ulnar collateral artery|arteria collateralis ulnaris inferior|artery|brachial',
    'radial-artery|radial artery|arteria radialis|artery|brachial>',
    'radial-recurrent|radial recurrent artery|arteria recurrens radialis|artery|radial-artery',
    'ulnar-artery|ulnar artery|arteria ulnaris|artery|brachial>',
    'ulnar-recurrent|ulnar recurrent arteries|arteriae recurrentes ulnares|artery|ulnar-artery',
    'common-interosseous|common interosseous artery|arteria interossea communis|artery|ulnar-artery',
    'anterior-interosseous-artery|anterior interosseous artery|arteria interossea anterior|artery|common-interosseous',
    'posterior-interosseous-artery|posterior interosseous artery|arteria interossea posterior|artery|common-interosseous',
    'median-artery|median artery (persistent, variant)|arteria mediana|artery|',
    'superficial-palmar-arch|superficial palmar arch|arcus palmaris superficialis|artery|ulnar-artery> radial-artery',
    'deep-palmar-arch|deep palmar arch|arcus palmaris profundus|artery|radial-artery> ulnar-artery',
    'princeps-pollicis|princeps pollicis artery|arteria princeps pollicis|artery|radial-artery',
    'palmar-digital-arteries|common palmar digital arteries|arteriae digitales palmares communes|artery|superficial-palmar-arch>',
    'upper-limb-capillaries|capillaries of the upper limb|rete capillare membri superioris|bed|palmar-digital-arteries> princeps-pollicis> deep-palmar-arch> profunda-brachii> anterior-interosseous-artery> posterior-interosseous-artery>',
    // thorax and abdomen
    'posterior-intercostal|posterior intercostal arteries|arteriae intercostales posteriores|artery|thoracic-aorta',
    'bronchial-arteries|bronchial arteries|rami bronchiales|artery|thoracic-aorta',
    'oesophageal-arteries|oesophageal arteries|rami oesophageales|artery|thoracic-aorta',
    'inferior-phrenic|inferior phrenic artery|arteria phrenica inferior|artery|abdominal-aorta',
    'coeliac-trunk|coeliac trunk|truncus coeliacus|artery|abdominal-aorta',
    'left-gastric|left gastric artery|arteria gastrica sinistra|artery|coeliac-trunk',
    'splenic-artery|splenic artery|arteria splenica|artery|coeliac-trunk',
    'left-gastro-omental|left gastro-omental artery|arteria gastroomentalis sinistra|artery|splenic-artery',
    'common-hepatic|common hepatic artery|arteria hepatica communis|artery|coeliac-trunk',
    'gastroduodenal|gastroduodenal artery|arteria gastroduodenalis|artery|common-hepatic',
    'right-gastro-omental|right gastro-omental artery|arteria gastroomentalis dextra|artery|gastroduodenal',
    'proper-hepatic|hepatic artery proper|arteria hepatica propria|artery|common-hepatic>',
    'right-gastric|right gastric artery|arteria gastrica dextra|artery|proper-hepatic',
    'right-hepatic|right hepatic artery|ramus dexter arteriae hepaticae propriae|artery|proper-hepatic',
    'left-hepatic|left hepatic artery|ramus sinister arteriae hepaticae propriae|artery|proper-hepatic',
    'cystic-artery|cystic artery|arteria cystica|artery|right-hepatic',
    'superior-mesenteric|superior mesenteric artery|arteria mesenterica superior|artery|abdominal-aorta',
    'inferior-pancreaticoduodenal|inferior pancreaticoduodenal artery|arteria pancreaticoduodenalis inferior|artery|superior-mesenteric',
    'jejunal-ileal|jejunal and ileal arteries|arteriae jejunales et ileales|artery|superior-mesenteric',
    'middle-colic|middle colic artery|arteria colica media|artery|superior-mesenteric',
    'right-colic|right colic artery|arteria colica dextra|artery|superior-mesenteric',
    'ileocolic|ileocolic artery|arteria ileocolica|artery|superior-mesenteric>',
    'appendicular|appendicular artery|arteria appendicularis|artery|ileocolic',
    'renal-artery|renal artery|arteria renalis|artery|abdominal-aorta',
    'gonadal-artery|testicular or ovarian artery|arteria testicularis / ovarica|artery|abdominal-aorta',
    'lumbar-arteries|lumbar arteries|arteriae lumbales|artery|abdominal-aorta',
    'inferior-mesenteric|inferior mesenteric artery|arteria mesenterica inferior|artery|abdominal-aorta',
    'left-colic|left colic artery|arteria colica sinistra|artery|inferior-mesenteric',
    'sigmoid-arteries|sigmoid arteries|arteriae sigmoideae|artery|inferior-mesenteric',
    'superior-rectal-artery|superior rectal artery|arteria rectalis superior|artery|inferior-mesenteric>',
    'median-sacral|median sacral artery|arteria sacralis mediana|artery|abdominal-aorta>',
    'common-iliac|common iliac artery|arteria iliaca communis|artery|abdominal-aorta>',
    'liver-sinusoids|hepatic sinusoids|sinusoidea hepatis|bed|right-hepatic> left-hepatic> hepatic-portal-vein>',
    'kidney-capillaries|renal capillaries|rete capillare renis|bed|renal-artery>',
    'spleen-sinusoids|splenic sinusoids|sinus splenici|bed|splenic-artery>',
    'stomach-capillaries|gastric capillaries|rete capillare gastricum|bed|left-gastric> right-gastric> left-gastro-omental> right-gastro-omental>',
    'gut-capillaries|intestinal capillaries|rete capillare intestini|bed|jejunal-ileal> ileocolic> right-colic> middle-colic> left-colic> sigmoid-arteries> appendicular>',
    'rectum-capillaries|rectal capillaries|rete capillare recti|bed|superior-rectal-artery> middle-rectal-artery> inferior-rectal-artery>',
    // pelvis and lower limb
    'internal-iliac|internal iliac artery|arteria iliaca interna|artery|common-iliac',
    'iliolumbar|iliolumbar artery|arteria iliolumbalis|artery|internal-iliac',
    'lateral-sacral|lateral sacral arteries|arteriae sacrales laterales|artery|internal-iliac',
    'superior-gluteal-artery|superior gluteal artery|arteria glutea superior|artery|internal-iliac',
    'inferior-gluteal-artery|inferior gluteal artery|arteria glutea inferior|artery|internal-iliac',
    'internal-pudendal|internal pudendal artery|arteria pudenda interna|artery|internal-iliac',
    'inferior-rectal-artery|inferior rectal artery|arteria rectalis inferior|artery|internal-pudendal',
    'obturator-artery|obturator artery|arteria obturatoria|artery|internal-iliac',
    'umbilical-artery|umbilical artery|arteria umbilicalis|artery|internal-iliac',
    'superior-vesical|superior vesical arteries|arteriae vesicales superiores|artery|umbilical-artery',
    'uterine-artery|uterine artery|arteria uterina|artery|internal-iliac',
    'middle-rectal-artery|middle rectal artery|arteria rectalis media|artery|internal-iliac',
    'external-iliac|external iliac artery|arteria iliaca externa|artery|common-iliac>',
    'inferior-epigastric|inferior epigastric artery|arteria epigastrica inferior|artery|external-iliac',
    'deep-circumflex-iliac|deep circumflex iliac artery|arteria circumflexa ilium profunda|artery|external-iliac',
    'femoral-artery|femoral artery|arteria femoralis|artery|external-iliac>',
    'superficial-epigastric|superficial epigastric artery|arteria epigastrica superficialis|artery|femoral-artery',
    'superficial-circumflex-iliac|superficial circumflex iliac artery|arteria circumflexa ilium superficialis|artery|femoral-artery',
    'external-pudendal|external pudendal arteries|arteriae pudendae externae|artery|femoral-artery',
    'profunda-femoris|deep artery of thigh|arteria profunda femoris|artery|femoral-artery',
    'medial-circumflex-femoral|medial circumflex femoral artery|arteria circumflexa femoris medialis|artery|profunda-femoris',
    'lateral-circumflex-femoral|lateral circumflex femoral artery|arteria circumflexa femoris lateralis|artery|profunda-femoris',
    'perforating-arteries|perforating arteries|arteriae perforantes|artery|profunda-femoris',
    'descending-genicular|descending genicular artery|arteria descendens genus|artery|femoral-artery',
    'popliteal|popliteal artery|arteria poplitea|artery|femoral-artery>',
    'genicular-arteries|genicular arteries|arteriae genus|artery|popliteal',
    'sural-arteries|sural arteries|arteriae surales|artery|popliteal',
    'anterior-tibial|anterior tibial artery|arteria tibialis anterior|artery|popliteal',
    'dorsalis-pedis|dorsal artery of foot|arteria dorsalis pedis|artery|anterior-tibial>',
    'arcuate-artery|arcuate artery|arteria arcuata|artery|dorsalis-pedis',
    'tibioperoneal-trunk|tibiofibular trunk|truncus tibiofibularis|artery|popliteal>',
    'posterior-tibial|posterior tibial artery|arteria tibialis posterior|artery|tibioperoneal-trunk>',
    'fibular-artery|fibular (peroneal) artery|arteria fibularis|artery|tibioperoneal-trunk',
    'medial-plantar-artery|medial plantar artery|arteria plantaris medialis|artery|posterior-tibial',
    'lateral-plantar-artery|lateral plantar artery|arteria plantaris lateralis|artery|posterior-tibial>',
    'plantar-arch|plantar arch|arcus plantaris profundus|artery|lateral-plantar-artery> dorsalis-pedis',
    'lower-limb-capillaries|capillaries of the lower limb|rete capillare membri inferioris|bed|plantar-arch> arcuate-artery> medial-plantar-artery> fibular-artery> sural-arteries> perforating-arteries> genicular-arteries>',
    'placenta|placenta|placenta|bed|umbilical-artery>',
  ],
  /* veins: id|en|la|to ("x" a tributary of x, "x>" continues as x) */
  veins: [
    'vena-cava-superior|superior vena cava|vena cava superior|right-atrium',
    'vena-cava-inferior|inferior vena cava|vena cava inferior|right-atrium',
    'coronary-sinus|coronary sinus|sinus coronarius|right-atrium',
    'great-cardiac-vein|great cardiac vein|vena cardiaca magna|coronary-sinus>',
    'brachiocephalic-vein|brachiocephalic vein|vena brachiocephalica|vena-cava-superior>',
    'internal-jugular-vein|internal jugular vein|vena jugularis interna|brachiocephalic-vein>',
    'external-jugular-vein|external jugular vein|vena jugularis externa|subclavian-vein',
    'subclavian-vein|subclavian vein|vena subclavia|brachiocephalic-vein>',
    'axillary-vein|axillary vein|vena axillaris|subclavian-vein>',
    'cephalic-vein|cephalic vein|vena cephalica|axillary-vein',
    'basilic-vein|basilic vein|vena basilica|brachial-veins',
    'median-cubital-vein|median cubital vein|vena mediana cubiti|basilic-vein',
    'brachial-veins|brachial veins|venae brachiales|axillary-vein>',
    'radial-veins|radial veins|venae radiales|brachial-veins',
    'ulnar-veins|ulnar veins|venae ulnares|brachial-veins',
    'azygos-vein|azygos vein|vena azygos|vena-cava-superior',
    'hemiazygos-vein|hemi-azygos vein|vena hemiazygos|azygos-vein',
    'oesophageal-veins|oesophageal veins|venae oesophageales|azygos-vein',
    'superior-sagittal-sinus|superior sagittal sinus|sinus sagittalis superior|confluence-of-sinuses>',
    'inferior-sagittal-sinus|inferior sagittal sinus|sinus sagittalis inferior|straight-sinus>',
    'great-cerebral-vein|great cerebral vein|vena magna cerebri|straight-sinus',
    'straight-sinus|straight sinus|sinus rectus|confluence-of-sinuses>',
    'confluence-of-sinuses|confluence of sinuses|confluens sinuum|transverse-sinus>',
    'transverse-sinus|transverse sinus|sinus transversus|sigmoid-sinus>',
    'sigmoid-sinus|sigmoid sinus|sinus sigmoideus|internal-jugular-vein>',
    'cavernous-sinus-vein|cavernous sinus|sinus cavernosus|superior-petrosal-sinus inferior-petrosal-sinus',
    'superior-petrosal-sinus|superior petrosal sinus|sinus petrosus superior|transverse-sinus',
    'inferior-petrosal-sinus|inferior petrosal sinus|sinus petrosus inferior|internal-jugular-vein',
    'superior-ophthalmic-vein|superior ophthalmic vein|vena ophthalmica superior|cavernous-sinus-vein',
    'facial-vein|facial vein|vena facialis|internal-jugular-vein',
    'hepatic-veins|hepatic veins|venae hepaticae|vena-cava-inferior',
    'renal-vein|renal vein|vena renalis|vena-cava-inferior',
    'gonadal-vein|testicular or ovarian vein|vena testicularis / ovarica|vena-cava-inferior/R renal-vein/L',
    'common-iliac-vein|common iliac vein|vena iliaca communis|vena-cava-inferior>',
    'internal-iliac-vein|internal iliac vein|vena iliaca interna|common-iliac-vein',
    'external-iliac-vein|external iliac vein|vena iliaca externa|common-iliac-vein>',
    'femoral-vein|femoral vein|vena femoralis|external-iliac-vein>',
    'great-saphenous-vein|great saphenous vein|vena saphena magna|femoral-vein',
    'popliteal-vein|popliteal vein|vena poplitea|femoral-vein>',
    'small-saphenous-vein|small saphenous vein|vena saphena parva|popliteal-vein',
    'anterior-tibial-veins|anterior tibial veins|venae tibiales anteriores|popliteal-vein',
    'posterior-tibial-veins|posterior tibial veins|venae tibiales posteriores|popliteal-vein',
    'hepatic-portal-vein|hepatic portal vein|vena portae hepatis|liver-sinusoids',
    'superior-mesenteric-vein|superior mesenteric vein|vena mesenterica superior|hepatic-portal-vein',
    'splenic-vein|splenic vein|vena splenica|hepatic-portal-vein',
    'inferior-mesenteric-vein|inferior mesenteric vein|vena mesenterica inferior|splenic-vein',
    'left-gastric-vein|left gastric vein|vena gastrica sinistra|hepatic-portal-vein',
    'superior-rectal-vein|superior rectal vein|vena rectalis superior|inferior-mesenteric-vein>',
    'middle-rectal-vein|middle rectal veins|venae rectales mediae|internal-iliac-vein',
    'inferior-rectal-vein|inferior rectal veins|venae rectales inferiores|internal-pudendal-vein',
    'internal-pudendal-vein|internal pudendal vein|vena pudenda interna|internal-iliac-vein',
    'paraumbilical-veins|para-umbilical veins|venae paraumbilicales|hepatic-portal-vein',
    'superficial-epigastric-vein|superficial epigastric vein|vena epigastrica superficialis|great-saphenous-vein',
    'umbilical-vein|umbilical vein|vena umbilicalis|ductus-venosus> hepatic-portal-vein',
    'ductus-venosus|ductus venosus|ductus venosus|vena-cava-inferior',
  ],
  /* beds drain to veins: bed|veins */
  bedVeins: [
    'brain-capillaries|superior-sagittal-sinus great-cerebral-vein',
    'upper-limb-capillaries|cephalic-vein basilic-vein radial-veins ulnar-veins',
    'lower-limb-capillaries|great-saphenous-vein small-saphenous-vein anterior-tibial-veins posterior-tibial-veins',
    'liver-sinusoids|hepatic-veins',
    'kidney-capillaries|renal-vein',
    'spleen-sinusoids|splenic-vein',
    'stomach-capillaries|left-gastric-vein',
    'gut-capillaries|superior-mesenteric-vein inferior-mesenteric-vein',
    'rectum-capillaries|superior-rectal-vein middle-rectal-vein inferior-rectal-vein',
    'myocardium|great-cardiac-vein',
    'placenta|umbilical-vein',
  ],
  /* foetal shunts (only in the "fetal" system) and their postnatal remnants (Moore & Persaud, The Developing Human 11e) */
  fetal: [
    'right-atrium|foramen-ovale-heart',
    'foramen-ovale-heart|left-atrium',
    'pulmonary-trunk|ductus-arteriosus',
    'ductus-arteriosus|thoracic-aorta',
  ],
  fetalNodes: [
    'foramen-ovale-heart|foramen ovale (of the heart)|foramen ovale cordis|heart',
    'ductus-arteriosus|ductus arteriosus|ductus arteriosus|artery',
  ],
  remnants: [
    'ligamentum-teres-hepatis|round ligament of liver|umbilical-vein',
    'ligamentum-venosum|ligamentum venosum|ductus-venosus',
    'fossa-ovalis|oval fossa|foramen-ovale-heart',
    'ligamentum-arteriosum|ligamentum arteriosum|ductus-arteriosus',
    'medial-umbilical-ligament|medial umbilical ligament|umbilical-artery',
  ],
  /* anastomoses (used only when the direct route is blocked): a|b (Moore9: scapular, cruciate and genicular anastomoses, circle of Willis,
       portosystemic anastomoses) */
  anastomoses: [
    'suprascapular-artery|circumflex-scapular',
    'dorsal-scapular-artery|circumflex-scapular',
    'posterior-communicating|posterior-cerebral',
    'anterior-communicating|anterior-cerebral',
    'inferior-gluteal-artery|medial-circumflex-femoral',
    'lateral-circumflex-femoral|genicular-arteries',
    'descending-genicular|genicular-arteries',
    'superior-epigastric|inferior-epigastric',
    'left-gastric-vein|oesophageal-veins',
    'superior-rectal-vein|middle-rectal-vein',
    'superior-rectal-vein|inferior-rectal-vein',
    'paraumbilical-veins|superficial-epigastric-vein',
    'superior-ulnar-collateral|ulnar-recurrent',
    'profunda-brachii|radial-recurrent',
    'superficial-palmar-arch|deep-palmar-arch',
  ],
  /* lymph: id|en|to (Moore9; Gray42) */
  lymph: [
    'lower-limb-superficial|superficial lymph vessels of the lower limb|superficial-inguinal-nodes',
    'scrotum-skin|scrotum and perianal skin|superficial-inguinal-nodes',
    'testis-lymph|testis|lumbar-nodes',
    'breast-lymph|breast|axillary-nodes parasternal-nodes',
    'upper-limb-lymph|upper limb|axillary-nodes',
    'head-neck-lymph|head and neck|deep-cervical-nodes',
    'stomach-lymph|stomach|coeliac-nodes',
    'lung-lymph|lung|bronchopulmonary-nodes',
    'superficial-inguinal-nodes|superficial inguinal lymph nodes|deep-inguinal-nodes external-iliac-nodes',
    'deep-inguinal-nodes|deep inguinal lymph nodes|external-iliac-nodes',
    'external-iliac-nodes|external iliac lymph nodes|common-iliac-nodes',
    'internal-iliac-nodes|internal iliac lymph nodes|common-iliac-nodes',
    'common-iliac-nodes|common iliac lymph nodes|lumbar-nodes',
    'lumbar-nodes|lumbar (para-aortic) lymph nodes|lumbar-trunks',
    'lumbar-trunks|lumbar lymphatic trunks|cisterna-chyli',
    'coeliac-nodes|coeliac lymph nodes|intestinal-trunk',
    'intestinal-trunk|intestinal lymphatic trunk|cisterna-chyli',
    'cisterna-chyli|cisterna chyli|thoracic-duct',
    'thoracic-duct|thoracic duct|left-venous-angle',
    'left-venous-angle|left venous angle (subclavian–internal jugular junction)|brachiocephalic-vein',
    'axillary-nodes|axillary lymph nodes|apical-axillary-nodes',
    'apical-axillary-nodes|apical axillary lymph nodes|subclavian-trunk',
    'subclavian-trunk|subclavian lymphatic trunk|thoracic-duct/L right-lymphatic-duct/R',
    'parasternal-nodes|parasternal lymph nodes|bronchomediastinal-trunk',
    'bronchopulmonary-nodes|bronchopulmonary lymph nodes|tracheobronchial-nodes',
    'tracheobronchial-nodes|tracheobronchial lymph nodes|bronchomediastinal-trunk',
    'bronchomediastinal-trunk|bronchomediastinal trunk|thoracic-duct/L right-lymphatic-duct/R',
    'deep-cervical-nodes|deep cervical lymph nodes|jugular-trunk',
    'jugular-trunk|jugular lymphatic trunk|thoracic-duct/L right-lymphatic-duct/R',
    'right-lymphatic-duct|right lymphatic duct|right-venous-angle',
    'right-venous-angle|right venous angle|brachiocephalic-vein',
  ],
  /* the visual pathway and the spinal tracts (Gray42): id|en */
  pathways: [
    'optic-chiasm|optic chiasm',
    'optic-tract|optic tract',
    'lateral-geniculate|lateral geniculate nucleus',
    "meyer-loop|Meyer's loop (temporal optic radiation)",
    'parietal-radiation|parietal optic radiation',
    'visual-cortex|primary visual cortex',
    'lateral-corticospinal|lateral corticospinal tract',
    'anterior-corticospinal|anterior corticospinal tract',
    'dorsal-columns|dorsal columns (gracile and cuneate fasciculi)',
    'spinothalamic|spinothalamic tract (anterolateral system)',
    'spinocerebellar|spinocerebellar tracts',
    'anterior-horn|anterior horn',
    'anterior-white-commissure|anterior white commissure',
    'medullary-pyramids|pyramidal decussation',
    'internal-arcuate|internal arcuate fibres (sensory decussation)',
  ],
  /* normal ranges of motion, degrees from the neutral zero: joint.dof|AAOS 1965 (Joint Motion: Method of Measuring and Recording)|AMA Guides
       (CHECK BEFORE RELEASE: the AMA column is the research brief's transcription; the 5th (2000) and 6th (2008) editions differ — verify
       against the edition the pack uses) */
  rom: [
    'shoulder.flexion|180|180',
    'shoulder.extension|60|50',
    'shoulder.abduction|180|170',
    'shoulder.medial-rotation|70|80',
    'shoulder.lateral-rotation|90|60',
    'elbow.flexion|150|140',
    'radioulnar.pronation|80|80',
    'radioulnar.supination|80|80',
    'wrist.flexion|80|60',
    'wrist.extension|70|60',
    'wrist.radial-deviation|20|20',
    'wrist.ulnar-deviation|30|30',
    'thumb-cmc.abduction|70|',
    'thumb-cmc.flexion|15|',
    'mcp.flexion|90|',
    'mcp.hyperextension|45|',
    'pip.flexion|100|',
    'dip.flexion|90|',
    'hip.flexion|120|100',
    'hip.extension|30|30',
    'hip.abduction|45|40',
    'hip.adduction|30|20',
    'hip.medial-rotation|45|40',
    'hip.lateral-rotation|45|50',
    'knee.flexion|135|150',
    'ankle.dorsiflexion|20|20',
    'ankle.plantarflexion|50|40',
    'subtalar.inversion|35|30',
    'subtalar.eversion|15|20',
    'cervical-spine.flexion|45|50',
    'cervical-spine.extension|45|60',
    'cervical-spine.lateral-flexion|45|45',
    'cervical-spine.rotation|60|80',
    'lumbar-spine.flexion|80|60',
    'lumbar-spine.extension|25|25',
  ],
};

const isObj = C.isObj,
  isNum = C.isNum,
  fin = Number.isFinite;
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const SEGS = [
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'C8',
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
  'T10',
  'T11',
  'T12',
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'Co1',
];
const segNo = (s: string) => SEGS.indexOf(s) + 1; // C1 = 1 … C8 = 8, T1 = 9 … T12 = 20, L1 = 21 … L5 = 25, S1 = 26 … S5 = 30, Co1 = 31
const DERMS = SEGS.slice(1, 30); // C2 … S5 (C1 has no dermatome)
const split = (s: string | undefined) => (s ? s.split(' ').filter(Boolean) : []);
/* the classification thresholds (the chapter, §3): a loss ≥ 0.9 of a target's innervation = paralysed / lost, ≥ 0.25 = weak / partial */
const LOST = 0.9,
  WEAK = 0.25;
const state = (f: number) => (f >= LOST ? 2 : f >= WEAK ? 1 : 0);

/* ---------- variants: patches of the graph with a frequency range and a source (research C6; Tubbs, Shoja & Loukas, Bergman's
     Comprehensive Encyclopedia of Human Anatomic Variation, 2016). freq: [low, high] of the published range, never one figure. */
const VARIANTS: Readonly<Record<string, { readonly kind: string; readonly freq: readonly number[]; readonly src: string }>> = {
  'martin-gruber': { kind: 'lesion', freq: [0.15, 0.25], src: 'Bergman 2016; pooled prevalence ≈ 20 %' },
  'riche-cannieu': { kind: 'lesion', freq: [0.2, 0.7], src: 'Bergman 2016 (dissection series vary widely)' },
  marinacci: { kind: 'lesion', freq: [0, 0.02], src: 'Bergman 2016 (rare)' },
  'prefixed-plexus': { kind: 'lesion', freq: [0.1, 0.6], src: 'Bergman 2016 (depends on the definition)' },
  'postfixed-plexus': { kind: 'lesion', freq: [0, 0.1], src: 'Bergman 2016' },
  'accessory-obturator': { kind: 'lesion', freq: [0.1, 0.3], src: 'Bergman 2016' },
  'brachialis-radial': {
    kind: 'lesion',
    freq: [0.3, 0.8],
    src: 'Bergman 2016; Gray42 (a radial twig to the lateral brachialis is common)',
  },
  'bovine-arch': { kind: 'trace', freq: [0.1, 0.25], src: 'Bergman 2016' },
  lusoria: { kind: 'trace', freq: [0.005, 0.01], src: 'Bergman 2016 (retro-oesophageal right subclavian)' },
  'left-dominance': { kind: 'trace', freq: [0.05, 0.1], src: 'Moore9 (coronary dominance)' },
  codominance: { kind: 'trace', freq: [0.1, 0.2], src: 'Moore9 (coronary dominance)' },
  'imv-into-smv': { kind: 'trace', freq: [0.2, 0.4], src: 'Moore9 (the IMV ends in the SMV or the junction)' },
  'high-radial': { kind: 'trace', freq: [0.05, 0.15], src: 'Bergman 2016 (high origin of the radial artery)' },
  'persistent-median-artery': { kind: 'trace', freq: [0.01, 0.2], src: 'Lucas T et al., J Anat 2020 (rising prevalence)' },
};
const MG_MUSCLES = ['first-dorsal-interosseous', 'adductor-pollicis', 'abductor-digiti-minimi'];
const THENAR_MEDIAN = ['abductor-pollicis-brevis', 'fpb-superficial', 'opponens-pollicis'];

/* ---------- the signs a lesion computes from the states of muscles (0 spared, 1 weak, 2 paralysed) and their losses ---------- */
const SIGNS: Readonly<Record<string, (S: (id: string) => number, L: (id: string) => number) => boolean>> = {
  'wrist-drop': S =>
    S('extensor-carpi-radialis-longus') === 2 && S('extensor-carpi-radialis-brevis') === 2 && S('extensor-carpi-ulnaris') === 2,
  'finger-drop': S => S('extensor-digitorum') === 2 && S('extensor-carpi-radialis-longus') < 2,
  'claw-hand': S => S('dorsal-interossei-2-4') === 2 && S('palmar-interossei') === 2 && S('extensor-digitorum') < 2,
  'ulnar-claw': (S, L) => L('lumbricals-3-4') >= LOST && L('lumbricals-1-2') < LOST && S('extensor-digitorum') < 2,
  benediction: S => S('flexor-digitorum-superficialis') === 2 && S('fdp-lateral') === 2 && S('fdp-medial') < 2,
  'ape-hand': S => S('abductor-pollicis-brevis') === 2 && S('opponens-pollicis') === 2,
  froment: S => S('adductor-pollicis') === 2 && S('flexor-pollicis-longus') < 2,
  'winged-scapula-medial': S => S('serratus-anterior') === 2,
  'winged-scapula-lateral': S => S('trapezius') === 2,
  'waiters-tip': S => S('deltoid') === 2 && S('infraspinatus') === 2 && S('biceps-brachii') >= 1,
  'foot-drop': S => S('tibialis-anterior') === 2,
  trendelenburg: (S, L) => (L('gluteus-medius') + L('gluteus-minimus')) / 2 >= 0.5,
  horner: S => S('superior-tarsal') === 2 && S('dilator-pupillae') === 2,
  ptosis: S => S('levator-palpebrae') === 2 || S('superior-tarsal') === 2,
  'down-and-out': S =>
    ['superior-rectus', 'medial-rectus', 'inferior-rectus', 'inferior-oblique'].every(m => S(m) === 2) &&
    S('lateral-rectus') < 2 &&
    S('superior-oblique') < 2,
  'fixed-dilated-pupil': S => S('sphincter-pupillae') === 2,
  diplopia: S =>
    ['superior-rectus', 'medial-rectus', 'inferior-rectus', 'inferior-oblique', 'lateral-rectus', 'superior-oblique'].some(m => S(m) >= 1),
  'facial-palsy-lmn': S => S('frontalis') === 2 && S('orbicularis-oculi') === 2 && S('orbicularis-oris') === 2,
  hyperacusis: S => S('stapedius') === 2,
  'jaw-deviation': S => S('lateral-pterygoid') === 2,
  'uvula-deviation': S => S('levator-veli-palatini') === 2,
  hoarseness: S => S('posterior-cricoarytenoid') === 2 || S('thyroarytenoid') === 2,
  'shoulder-drop': S => S('trapezius') === 2,
  'tongue-deviation': S => S('genioglossus') === 2,
  hemidiaphragm: S => S('diaphragm') === 2,
};
const ISSUES: Readonly<Record<string, Str>> = {
  lesion: ['variant-sensitive', 'level-ambiguous', 'range', 'uncurated'],
  query: ['uncurated', 'range'],
  trace: ['variant-sensitive', 'no-path', 'collateral'],
  rom: ['limited', 'hypermobile', 'range'],
  biomech: ['impossible', 'model', 'range', 'clamped'],
  regions: ['range'],
  visual: ['range'],
  cord: ['range'],
};

/* ---------- the graph, built once from SRC ---------- */
let G: Graph | null = null;
function graph(): Graph {
  if (!G) G = build();
  return G;
}
function build() {
  const node = new Map<string, AnNode>(),
    problems: string[] = [];
  const add = (id: string, type: string, en?: string, la?: string, x?: Partial<AnNode>): AnNode => {
    if (node.has(id)) problems.push('duplicate id ' + id);
    if (!C.ID_RE.test(id)) problems.push('bad id ' + id);
    const n = Object.assign({ id, type, en: en || id, la: la || '' }, x || {});
    node.set(id, n);
    return n;
  };
  const rows = (a: Str, k: number) =>
    a.map(r => {
      const f = r.split('|');
      if (f.length !== k) problems.push(`row of ${k} fields: ${r.slice(0, 40)}`);
      return f as Row;
    });
  for (const s of SEGS)
    add(s, 'root', s + ' spinal nerve', 'nervus spinalis ' + s, {
      fam: s[0] === 'C' ? (segNo(s) >= 5 ? 'brachial' : 'cervical') : s[0] === 'T' ? (s === 'T1' ? 'brachial' : 'thoracic') : 'lumbosacral',
    });
  for (const [id, en] of rows(SRC.regions, 2)) add(id, 'region', en);
  for (const [id, en, reg] of rows(SRC.compartments, 3)) add(id, 'compartment', en, '', { partOf: [reg] });
  for (const [id, en, la, par, fam] of rows(SRC.elements, 5))
    add(id, /-cord$/.test(id) ? 'cord' : /-(ant|post)$/.test(id) ? 'division' : 'trunk', en, la, { parents: split(par), fam });
  for (const [id, en, la, src, roots, levels, fam] of rows(SRC.nerves, 7)) {
    const n = add(id, 'nerve', en, la, {
      roots: split(roots),
      levels: levels ? split(levels) : ['origin'],
      fam,
      src: [],
      parent: null,
      pk: 0,
      pre: false,
      cranial: src === '-',
    });
    if (
      src.includes('@') ||
      (src && !src.includes(' ') && src !== '-' && !SEGS.includes(src.replace('!', '')) && !/-(trunk|cord)$/.test(src))
    ) {
      const [p, l] = src.split('@');
      n.parent = p!;
      n.plevel = l || null;
    } else if (src !== '-') {
      for (const t of split(src)) {
        if (t.endsWith('!')) n.pre = true;
        n.src!.push(t.replace('!', ''));
      }
    }
  }
  for (const [id, num, mod, exit] of rows(SRC.cranial, 4)) {
    const n = node.get(id);
    if (!n) problems.push('cranial: no nerve ' + id);
    else Object.assign(n, { cn: num, modality: split(mod), exit });
  }
  for (const [id, en, la, reg] of rows(SRC.bones, 4)) add(id, 'bone', en, la, { partOf: [reg] });
  for (const [id, en, bone] of rows(SRC.landmarks, 3)) add(id, 'landmark', en, '', { partOf: bone === '-' ? [] : [bone] });
  for (const [id, en, la, cls, dofs] of rows(SRC.joints, 5)) add(id, 'joint', en, la, { cls, dofs: split(dofs) });
  for (const [id, en, la, inn, act, o, ins, art, grp, of] of rows(SRC.muscles, 10))
    add(id, 'muscle', en, la, {
      inn,
      actions: split(act).map(a => ({ dof: a.replace('*', ''), prime: a.endsWith('*') })),
      origin: split(o),
      insertion: split(ins),
      arteries: split(art),
      partOf: [of, grp].filter(Boolean),
      parts: [],
    });
  for (const [id, en, inn] of rows(SRC.areas, 3)) add(id, 'area', en, '', { inn });
  for (const [id, en, inn] of rows(SRC.fns, 3)) add(id, 'function', en, '', { inn });
  for (const [id, en, kind, mus, roots, aff] of rows(SRC.reflexes, 6))
    add(id, 'reflex', en, '', { kind, muscles: split(mus), roots: split(roots), aff: split(aff) });
  for (const [id, en, kind, nv, vs] of rows(SRC.sites, 5)) add(id, 'site', en, '', { kind, nerves: split(nv), vessels: split(vs) });
  for (const [s, en] of rows(SRC.keyPoints, 2)) {
    add('kp-' + s, 'keypoint', en, '', { seg: s });
    add('dermatome-' + s, 'dermatome', 'dermatome ' + s, 'dermatoma ' + s, { seg: s, kp: 'kp-' + s });
  }
  const keyMuscle: Record<string, string> = {};
  for (const [s, dof] of rows(SRC.keyMuscles, 2)) keyMuscle[s] = dof!;
  // vessels: edges a → b with flags {side, fetal, cont}
  const edges: Edge[] = [];
  const edge = (a: string, b: string, o?: Partial<Edge>) =>
    edges.push(Object.assign({ a, b, side: null, cont: false, sys: 'blood' }, o || {}));
  const tok = (t: string) => {
    const m = /^([A-Za-z0-9-]+)(>?)(?:\/([LR]))?$/.exec(t);
    return m ? { id: m[1], cont: !!m[2], side: m[3] || null } : null;
  };
  for (const [id, en, la, type, from] of rows(SRC.arteries, 5)) {
    add(id, type, en, la);
    for (const t of split(from)) {
      const k = tok(t);
      if (!k) problems.push('bad vessel token ' + t);
      else edge(k.id!, id, { cont: k.cont, side: k.side });
    }
  }
  for (const [id, en, la, type] of rows(SRC.fetalNodes, 4)) add(id, type, en, la, { fetal: true });
  for (const [id, en, la, to] of rows(SRC.veins, 4)) {
    add(id, 'vein', en, la);
    for (const t of split(to)) {
      const k = tok(t);
      if (!k) problems.push('bad vessel token ' + t);
      else edge(id, k.id!, { cont: k.cont, side: k.side });
    }
  }
  for (const [bed, vs] of rows(SRC.bedVeins, 2)) for (const v of split(vs)) edge(bed, v, { cont: true });
  for (const [a, b] of rows(SRC.fetal, 2)) edge(a, b, { fetal: true, cont: true });
  for (const [id, en, of] of rows(SRC.remnants, 3)) add(id, 'remnant', en, '', { of });
  const anast = rows(SRC.anastomoses, 2);
  for (const [id, en, to] of rows(SRC.lymph, 3)) {
    add(id, 'lymph', en);
    for (const t of split(to)) {
      const k = tok(t);
      if (!k) problems.push('bad lymph token ' + t);
      else edge(id, k.id!, { sys: 'lymph', side: k.side, cont: true });
    }
  }
  for (const [id, en] of rows(SRC.pathways, 2)) add(id, 'tract', en);
  const FETAL_ONLY = ['placenta', 'umbilical-vein', 'ductus-venosus', 'foramen-ovale-heart', 'ductus-arteriosus'];
  for (const e of edges) if (FETAL_ONLY.includes(e.a) || FETAL_ONLY.includes(e.b)) e.fetal = true;
  // de-duplicate edges (a vessel listed from both ends)
  const seen = new Set<string>(),
    E2: Edge[] = [];
  for (const e of edges) {
    const k = `${e.a}>${e.b}>${e.side}>${e.sys}`;
    if (seen.has(k)) continue;
    seen.add(k);
    E2.push(e);
  }
  for (const e of E2) for (const id of [e.a, e.b]) if (!node.has(id)) problems.push('edge to an unknown node ' + id);
  for (const [a, b] of anast) for (const id of [a, b]) if (!node.has(id)) problems.push('anastomosis with an unknown node ' + id);
  // aggregates: a muscle with no innervation of its own is the sum of its parts
  for (const n of node.values())
    if (n.type === 'muscle')
      for (const p of n.partOf!) {
        const q = node.get(p);
        if (q && q.type === 'muscle') q.parts!.push(n.id);
      }
  // the roots each plexus element carries
  const elRoots = new Map<string, Set<string>>();
  const rootsOf = (id: string): Set<string> => {
    if (SEGS.includes(id)) return new Set([id]);
    if (elRoots.has(id)) return elRoots.get(id)!;
    const n = node.get(id),
      s = new Set<string>();
    elRoots.set(id, s);
    if (n && n.parents) for (const p of n.parents) for (const r of rootsOf(p)) s.add(r);
    return s;
  };
  for (const n of node.values()) if (n.parents) rootsOf(n.id);
  // movers of every joint.dof (leaf muscles only)
  const movers: Record<string, { prime: string[]; acc: string[] }> = {};
  for (const n of node.values())
    if (n.type === 'muscle')
      for (const a of n.actions!) {
        const [j, d] = a.dof.split('.'),
          jn = node.get(j!);
        if (!jn || jn.type !== 'joint' || !jn.dofs!.includes(d!)) problems.push(`muscle ${n.id}: unknown movement ${a.dof}`);
        (movers[a.dof] = movers[a.dof] || { prime: [], acc: [] })[a.prime ? 'prime' : 'acc'].push(n.id);
      }
  for (const s of Object.keys(keyMuscle)) if (!movers[keyMuscle[s]!]) problems.push('key muscle without movers ' + s);
  for (const n of node.values()) {
    if (n.type === 'muscle') {
      for (const a of n.origin!.concat(n.insertion!))
        if (!node.has(a) || !['landmark', 'bone'].includes(node.get(a)!.type)) problems.push(`muscle ${n.id}: unknown attachment ${a}`);
      for (const a of n.arteries!) if (!node.has(a) || node.get(a)!.type !== 'artery') problems.push(`muscle ${n.id}: unknown artery ${a}`);
    }
    if (n.partOf) for (const p of n.partOf) if (!node.has(p)) problems.push(`${n.id}: part of unknown ${p}`);
    if (n.type === 'reflex') {
      for (const m of n.muscles!) if (!node.has(m)) problems.push(`reflex ${n.id}: unknown muscle ${m}`);
    }
    if (n.type === 'nerve' && n.parent) {
      const p = node.get(n.parent);
      if (!p || p.type !== 'nerve') problems.push(`nerve ${n.id}: unknown parent ${n.parent}`);
      else {
        n.pk = n.plevel ? p.levels!.indexOf(n.plevel) : p.levels!.length - 1;
        if (n.pk < 0) problems.push(`nerve ${n.id}: ${n.parent} has no level ${n.plevel}`);
        for (const r of n.roots!) if (!p.roots!.includes(r)) problems.push(`nerve ${n.id}: root ${r} not in ${p.id}`);
      }
    }
    if (n.type === 'nerve' && !n.parent && !n.cranial)
      for (const r of n.roots!) if (!n.src!.some(t => rootsOf(t).has(r))) problems.push(`nerve ${n.id}: root ${r} does not reach it`);
    if (n.type === 'site')
      for (const t of n.nerves!) {
        const [id, l] = t.split('@');
        const q = node.get(id!);
        if (!q || q.type !== 'nerve' || (l && !q.levels!.includes(l))) problems.push(`site ${n.id}: unknown ${t}`);
      }
  }
  for (const n of node.values()) if (n.type === 'nerve' && n.parent && node.get(n.parent)) n.fam = node.get(n.parent)!.fam || n.fam!;
  return { node, edges: E2, anast, movers, keyMuscle, elRoots, rootsOf, problems };
}

/* ---------- innervation routes: every target (muscle, area, function, nerve end) → [{r, w, pre, segs: [[node, lo, hi], …]}]
     A fibre of root r reaches a target through the plexus elements that carry r, then along each nerve from its origin (level 0)
     to the level where the next branch leaves. A lesion (node, level k) cuts a route that has a segment [node, lo, hi] with
     lo ≤ k ≤ hi; a root lesion cuts the routes of that root (a preganglionic route only by an avulsion). */
function parseInn(s: string | undefined): InnEntry[] {
  if (!s) return [];
  return s.split(';').map(e => {
    const [nl, rest] = e.split(':');
    const [nerve, level] = nl!.split('@');
    const [rs, w] = (rest || '').split('=');
    return {
      nerve: nerve!,
      level: level || null,
      roots: split(rs).map(t => ({ r: t.replace(/[*~]$/, ''), w: t.endsWith('*') ? 2 : t.endsWith('~') ? 0.5 : 1 })),
      w: w ? +w : 1,
    };
  });
}
function routesOf(entry: InnEntry, Gr: Graph): Route[] | null {
  const n = Gr.node.get(entry.nerve);
  if (!n || n.type !== 'nerve') return null;
  const k = entry.level ? n.levels!.indexOf(entry.level) : n.levels!.length - 1;
  if (k < 0) return null;
  const segs: RSeg[] = [[n.id, 0, k]];
  let cur = n,
    guard = 0;
  while (cur.parent && guard++ < 20) {
    const p = Gr.node.get(cur.parent);
    segs.push([p!.id, 0, cur.pk!]);
    cur = p!;
  }
  if (!entry.roots.length) return [{ r: null, w: entry.w, pre: false, segs }];
  const out: Route[] = [];
  for (const { r, w } of entry.roots) {
    let path: string[] | null = null;
    for (const t of cur.src!) {
      if (t === r) {
        path = [];
        break;
      }
      if (!SEGS.includes(t) && Gr.rootsOf(t).has(r)) {
        path = elPath(t, r, Gr);
        break;
      }
    }
    if (cur.cranial && !cur.src!.length) path = [];
    if (path === null) return null;
    out.push({ r, w: w * entry.w, pre: cur.pre!, segs: segs.concat(path.map(e => [e, 0, 0])) });
  }
  return out;
}
function elPath(el: string, r: string, Gr: Graph): string[] {
  const out = [el];
  let cur = Gr.node.get(el),
    guard = 0;
  while (cur && cur.parents && guard++ < 8) {
    const p = cur.parents.find(q => q === r || (!SEGS.includes(q) && Gr.rootsOf(q).has(r)));
    if (!p || p === r) break;
    out.push(p);
    cur = Gr.node.get(p);
  }
  return out;
}
const RT = new Map<string, { T: Map<string, Route[]>; bad: string[] }>();
/** the route table for a set of enabled variants (cached): {targets: Map id → routes, nerveEnd: Map nerve → routes} */
function routeTable(vs: Str) {
  const key = vs.slice().sort().join(',');
  if (RT.has(key)) return RT.get(key)!;
  const Gr = graph(),
    T = new Map<string, Route[]>(),
    bad: string[] = [];
  const addT = (id: string, inn: string) => {
    const rs: Route[] = [];
    for (const e of parseInn(inn)) {
      const r = routesOf(e, Gr);
      if (!r) bad.push(id);
      else rs.push(...r);
    }
    T.set(id, rs);
  };
  for (const n of Gr.node.values()) {
    if ((n.type === 'muscle' || n.type === 'area' || n.type === 'function') && n.inn) addT(n.id, n.inn);
    if (n.type === 'nerve') addT('nerve:' + n.id, n.id + ':' + n.roots!.join(' '));
  }
  const lv = (nv: string, l: string) => Gr.node.get(nv)!.levels!.indexOf(l);
  const on = (v: string) => vs.includes(v);
  const halve = (id: string, f: (s: RSeg[]) => RSeg[]) => {
    if (!T.has(id)) return;
    T.set(
      id,
      T.get(id)!.flatMap(rt => [Object.assign({}, rt, { w: rt.w / 2 }), Object.assign({}, rt, { w: rt.w / 2, segs: f(rt.segs) })]),
    );
  };
  if (on('martin-gruber'))
    for (const m of MG_MUSCLES)
      halve(m, s =>
        s
          .map((q): RSeg => (q[0] === 'ulnar' ? ['ulnar', lv('ulnar', 'forearm'), q[2]] : q))
          .concat([['median', 0, lv('median', 'forearm')]]),
      );
  if (on('riche-cannieu'))
    for (const m of THENAR_MEDIAN)
      halve(m, s =>
        s
          .filter(q => q[0] !== 'median' && q[0] !== 'recurrent-median')
          .concat([
            ['ulnar', 0, lv('ulnar', 'guyon')],
            ['deep-ulnar', 0, lv('deep-ulnar', 'palm')],
          ]),
      );
  if (on('marinacci'))
    for (const m of THENAR_MEDIAN)
      halve(m, s =>
        s
          .map((q): RSeg => (q[0] === 'median' ? ['median', lv('median', 'forearm'), q[2]] : q))
          .concat([['ulnar', 0, lv('ulnar', 'forearm')]]),
      );
  if (on('accessory-obturator')) {
    const r = routesOf(parseInn('accessory-obturator:L3 L4=0.5')[0]!, Gr);
    T.set('pectineus', T.get('pectineus')!.concat(r!));
  }
  if (on('brachialis-radial')) {
    const r = routesOf(parseInn('radial@lateral-septum:C5 C6=0.25')[0]!, Gr);
    T.set('brachialis', T.get('brachialis')!.concat(r!));
  }
  const shift = on('prefixed-plexus') ? -1 : on('postfixed-plexus') ? 1 : 0;
  if (shift) {
    const brachial = (id: string) => {
      const q = Gr.node.get(id);
      return q && q.fam === 'brachial' && q.type !== 'root';
    };
    for (const [id, rs] of T)
      T.set(
        id,
        rs.map(rt =>
          rt.r && rt.segs.some(q => brachial(q[0])) ? Object.assign({}, rt, { r: SEGS[SEGS.indexOf(rt.r) + shift] || rt.r }) : rt,
        ),
      );
  }
  const res = { T, bad };
  if (RT.size > 64) RT.clear();
  RT.set(key, res);
  return res;
}

/* ---------- a lesion → its findings ---------- */
/** parse "id" or "id@level" → {id, level} */
const parseAt = (s: string): { id: string; level: string | null } => {
  const i = s.indexOf('@');
  return i < 0 ? { id: s, level: null } : { id: s.slice(0, i), level: s.slice(i + 1) };
};
const LESIONABLE = ['root', 'trunk', 'division', 'cord', 'nerve', 'site'];
function cutsOf(lesion: Lesion): Cuts {
  const Gr = graph(),
    cuts = new Map<string, number[]>(),
    roots = new Set<string>();
  const addCut = (id: string, k: number) => {
    if (!cuts.has(id)) cuts.set(id, []);
    cuts.get(id)!.push(k);
  };
  for (const s of lesion.at || []) {
    const { id, level } = parseAt(s),
      n = Gr.node.get(id);
    if (!n) continue;
    if (n.type === 'root') roots.add(id);
    else if (n.type === 'nerve') addCut(id, level ? n.levels!.indexOf(level) : 0);
    else if (n.type === 'site')
      for (const t of n.nerves!) {
        const p = parseAt(t),
          q = Gr.node.get(p.id);
        addCut(p.id, p.level ? q!.levels!.indexOf(p.level) : 0);
      }
    else addCut(id, 0);
  }
  return { cuts, roots, avulsion: !!lesion.avulsion };
}
function cutShare(routes: readonly Route[] | undefined, L: Cuts, only?: Map<string | null, number>) {
  if (!routes || !routes.length) return NaN;
  let all = 0,
    cut = 0;
  for (const rt of routes) {
    if (only && !only.has(rt.r)) continue;
    const w = only ? only.get(rt.r) : rt.w;
    all += w!;
    let c = rt.r !== null && L.roots.has(rt.r) && (!rt.pre || L.avulsion);
    if (!c)
      for (const s of rt.segs) {
        const ks = L.cuts.get(s[0]);
        if (ks && ks.some(k => s[1] <= k && k <= s[2])) {
          c = true;
          break;
        }
      }
    if (c) cut += w!;
  }
  return all > 0 ? cut / all : NaN;
}
function evaluate(lesion: Lesion, vs: Str, comp: number): Findings {
  const Gr = graph(),
    { T } = routeTable(vs),
    L = cutsOf(lesion),
    c = fin(comp) ? Math.min(1, Math.max(0, comp)) : 1;
  const F = { loss: {}, muscle: {}, move: {}, reflex: {}, area: {}, fn: {}, dermatome: {}, sign: {}, nerve: {} } as Findings;
  const leaf: AnNode[] = [],
    agg: AnNode[] = [];
  for (const n of Gr.node.values()) if (n.type === 'muscle') (n.parts!.length ? agg : leaf).push(n);
  for (const n of leaf) {
    const f = c * cutShare(T.get(n.id), L);
    F.loss[n.id] = fin(f) ? f : 0;
    F.muscle[n.id] = state(F.loss[n.id]!);
  }
  for (const n of agg) {
    const f = n.parts!.reduce((a, p) => a + F.loss[p]!, 0) / n.parts!.length;
    F.loss[n.id] = f;
    F.muscle[n.id] = state(f);
  }
  const S = (id: string) => F.muscle[id] || 0,
    Lf = (id: string) => F.loss[id] || 0;
  for (const [dof, mv] of Object.entries(Gr.movers)) {
    const primes = mv.prime.length ? mv.prime : mv.acc,
      acc = mv.prime.length ? mv.acc : [];
    const allP = primes.every(m => S(m) === 2),
      anyP = primes.some(m => S(m) >= 1);
    F.move[dof] = allP ? (acc.length && acc.some(m => S(m) < 2) ? 1 : 2) : anyP ? 1 : 0;
  }
  for (const n of Gr.node.values()) {
    if (n.type === 'area' || n.type === 'function') {
      const f = c * cutShare(T.get(n.id), L);
      (n.type === 'area' ? F.area : F.fn)[n.id] = state(fin(f) ? f : 0);
    } else if (n.type === 'nerve') {
      const f = c * cutShare(T.get('nerve:' + n.id), L);
      F.nerve[n.id] = fin(f) ? f : 0;
    }
  }
  for (const n of Gr.node.values())
    if (n.type === 'reflex') {
      let f = 0;
      if (n.kind === 'spinal') {
        const only = new Map<string | null, number>();
        for (const t of n.roots!) only.set(t.replace(/[*~]$/, ''), t.endsWith('*') ? 2 : t.endsWith('~') ? 0.5 : 1);
        const fs = n.muscles!.map(m => cutShare(T.get(m), L, only)).filter(fin);
        f = fs.length ? (c * fs.reduce((a, b) => a + b, 0)) / fs.length : 0;
      } else f = n.muscles!.reduce((a, m) => Math.max(a, Lf(m)), 0);
      for (const a of n.aff!) {
        const p = parseAt(a),
          q = Gr.node.get(p.id);
        const rs = routesOf(
          { nerve: p.id, level: p.level, roots: q!.cranial || !q!.roots!.length ? [] : q!.roots!.map(r => ({ r, w: 1 })), w: 1 },
          Gr,
        );
        const g = c * cutShare(rs!, L);
        if (fin(g)) f = Math.max(f, g);
      }
      F.reflex[n.id] = f >= LOST ? 2 : f >= WEAK ? 1 : 0;
    }
  for (const d of DERMS) {
    if (!L.roots.has(d)) {
      F.dermatome[d] = 0;
      continue;
    }
    const i = SEGS.indexOf(d),
      nb = L.roots.has(SEGS[i - 1]!) || L.roots.has(SEGS[i + 1]!);
    F.dermatome[d] = nb && c >= LOST ? 2 : 1; // overlapping dermatomes: one root alone leaves only a partial (autonomous-zone) loss (Lee 2008)
  }
  for (const [k, f] of Object.entries(SIGNS)) F.sign[k] = f(S, Lf) ? 1 : 0;
  F.ulnarClaw = Lf('lumbricals-3-4') * (0.5 + 0.5 * (1 - Lf('fdp-medial'))) * (S('extensor-digitorum') < 2 ? 1 : 0);
  let par = 0,
    weak = 0;
  for (const n of leaf) {
    if (F.muscle[n.id] === 2) par++;
    else if (F.muscle[n.id] === 1) weak++;
  }
  F.paralysed = par;
  F.weak = weak;
  F.areasLost = Object.values(F.area).filter(v => v === 2).length;
  F.areasPartial = Object.values(F.area).filter(v => v === 1).length;
  F.reflexesAbnormal = Object.values(F.reflex).filter(v => v > 0).length;
  F.signs = Object.values(F.sign).reduce((a, b) => a + b, 0);
  return F;
}
const FINDING_GROUPS: readonly Group[] = ['muscle', 'move', 'reflex', 'area', 'fn', 'dermatome', 'sign'];
/** a finding name "muscle.deltoid" → its value in F (NaN when the name is not a finding) */
function findingValue(F: Findings, name: string): number {
  const i = name.indexOf('.');
  if (i < 0) return NaN;
  const g = name.slice(0, i),
    k = name.slice(i + 1);
  if (g === 'nerve' || g === 'loss') return has(F[g], k) ? F[g][k]! : NaN;
  return (FINDING_GROUPS as Str).includes(g) && has(F[g as Group], k) ? F[g as Group][k]! : NaN;
}
function sameFindings(A: Findings, B: Findings) {
  for (const g of FINDING_GROUPS) for (const k of Object.keys(A[g])) if (A[g][k] !== B[g][k]) return false;
  return true;
}
function diffCount(A: Findings, B: Findings) {
  let n = 0;
  for (const g of FINDING_GROUPS) for (const k of Object.keys(A[g])) if (A[g][k] !== B[g][k]) n++;
  return n;
}

/* ---------- the graph's relations (query mode) ---------- */
const REL: Readonly<Record<string, Rel>> = {
  innervates: { from: ['nerve', 'trunk', 'division', 'cord', 'root'], to: ['muscle', 'area', 'function'] },
  root: { from: ['root'], to: ['muscle', 'nerve', 'area', 'function', 'reflex'] },
  acts: { from: ['muscle'], to: 'dof' },
  prime: { from: ['muscle'], to: 'dof' },
  supplies: { from: ['artery'], to: ['muscle'] },
  origin: { from: ['muscle'], to: ['landmark', 'bone'] },
  insertion: { from: ['muscle'], to: ['landmark', 'bone'] },
  attaches: { from: ['muscle'], to: ['landmark', 'bone'] },
  branch: {
    from: ['nerve', 'artery', 'vein', 'trunk', 'division', 'cord'],
    to: ['nerve', 'artery', 'vein', 'trunk', 'division', 'cord', 'root'],
  },
  part: { from: '*', to: '*' },
  passes: { from: ['nerve', 'artery', 'vein'], to: ['site'] },
  drains: { from: ['vein', 'lymph', 'bed'], to: ['vein', 'lymph', 'heart'] },
  'reflex-nerve': { from: ['reflex'], to: ['nerve', 'trunk', 'division', 'cord', 'root'] },
  'key-muscle': { from: ['root'], to: 'dof' },
  'key-point': { from: ['root'], to: ['keypoint'] },
  class: { from: ['joint'], to: 'word:fibrous|cartilaginous|plane|hinge|pivot|condyloid|saddle|ball-and-socket|functional' },
  modality: { from: ['nerve'], to: 'word:sensory|motor|mixed|parasympathetic' },
  number: { from: ['nerve'], to: 'word:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII' },
  exits: { from: ['nerve'], to: 'word:forebrain|midbrain|pons|pontomedullary|medulla' },
  remnant: { from: ['remnant'], to: ['vein', 'artery', 'heart'] },
  continues: { from: ['artery', 'vein', 'heart', 'bed'], to: ['artery', 'vein', 'heart', 'bed'] },
};
const RELS = Object.keys(REL);
/** rel(from, to) → 1, 0, or NaN when the data needed is not curated */
function relation(rel: string, a: string, b: string, vs: Str): number {
  const Gr = graph(),
    A = Gr.node.get(a),
    B = Gr.node.get(b);
  if (!A) return NaN;
  const thru = (routes: readonly Route[] | undefined, id: string) => {
    const n = Gr.node.get(id);
    if (!routes || !routes.length) return NaN;
    return routes.some(rt => (n!.type === 'root' ? rt.r === id : rt.segs.some(s => s[0] === id))) ? 1 : 0;
  };
  const { T } = routeTable(vs);
  const leafs = (id: string) => {
    const n = Gr.node.get(id);
    return n && n.parts && n.parts.length ? n.parts : [id];
  };
  switch (rel) {
    case 'innervates':
      return Math.max(...leafs(b).map(m => thru(T.get(m), a)));
    case 'root':
      if (B!.type === 'nerve') return B!.roots!.includes(a) ? 1 : 0;
      if (B!.type === 'reflex') return B!.roots!.some(t => t.replace(/[*~]$/, '') === a) ? 1 : 0;
      return Math.max(...leafs(b).map(m => thru(T.get(m), a)));
    case 'acts':
    case 'prime': {
      const ms = leafs(a).map(m => Gr.node.get(m));
      if (!ms.some(m => m!.actions!.length)) return NaN;
      return ms.some(m => m!.actions!.some(x => x.dof === b && (rel === 'acts' || x.prime))) ? 1 : 0;
    }
    case 'supplies':
      return A.type === 'artery' && B!.arteries!.length ? (B!.arteries!.includes(a) ? 1 : 0) : NaN;
    case 'origin':
    case 'insertion':
    case 'attaches': {
      const L = rel === 'origin' ? A.origin : rel === 'insertion' ? A.insertion : A.origin!.concat(A.insertion!);
      if (!L!.length) return NaN;
      return L!.some(l => l === b || (Gr.node.get(l)!.partOf || []).includes(b)) ? 1 : 0;
    }
    case 'branch':
      return upstream(a, Gr).has(b) ? 1 : 0;
    case 'part':
      return ancestors(a, Gr).has(b) ? 1 : 0;
    case 'passes':
      return B!.nerves!.some(t => parseAt(t).id === a) || B!.vessels!.includes(a) ? 1 : 0;
    case 'drains':
      return reach(a, b, A.type === 'lymph' ? 'lymph' : 'blood', vs) ? 1 : 0;
    case 'reflex-nerve': {
      const rs: Route[] = [];
      for (const m of A.muscles!) rs.push(...(T.get(m) || []));
      for (const f of A.aff!) {
        const p = parseAt(f);
        rs.push(...(routesOf({ nerve: p.id, level: p.level, roots: [], w: 1 }, Gr) || []));
      }
      return thru(rs, b);
    }
    case 'key-muscle':
      return Gr.keyMuscle[a] === b ? 1 : 0;
    case 'key-point':
      return b === 'kp-' + a ? 1 : 0;
    case 'class':
      return A.cls === b ? 1 : 0;
    case 'modality':
      return A.modality ? (A.modality.includes(b) ? 1 : 0) : NaN;
    case 'number':
      return A.cn ? (A.cn === b ? 1 : 0) : NaN;
    case 'exits':
      return A.exit ? (A.exit === b ? 1 : 0) : NaN;
    case 'remnant':
      return A.of === b ? 1 : 0;
    case 'continues':
      return Gr.edges.some(e => e.a === a && e.b === b && e.cont && !e.fetal) ? 1 : 0;
  }
  return NaN;
}
function upstream(id: string, Gr: Graph) {
  // everything a structure branches from (nerve parents, plexus sources, upstream vessels along branch edges)
  const out = new Set<string>(),
    st = [id];
  let guard = 0;
  while (st.length && guard++ < 2000) {
    const x = st.pop(),
      n = Gr.node.get(x!);
    if (!n) continue;
    const ups: string[] = [];
    if (n.type === 'nerve') {
      if (n.parent) ups.push(n.parent);
      ups.push(...n.src!);
    }
    if (n.parents) ups.push(...n.parents);
    if (n.type === 'artery')
      for (const e of Gr.edges) if (e.b === x && e.sys === 'blood' && !e.fetal && Gr.node.get(e.a)!.type === 'artery') ups.push(e.a);
    if (n.type === 'vein')
      for (const e of Gr.edges) if (e.a === x && e.sys === 'blood' && !e.fetal && Gr.node.get(e.b)!.type === 'vein') ups.push(e.b);
    for (const u of ups)
      if (!out.has(u)) {
        out.add(u);
        st.push(u);
      }
  }
  return out;
}
function ancestors(id: string, Gr: Graph) {
  const out = new Set<string>(),
    st = [id];
  let guard = 0;
  while (st.length && guard++ < 200) {
    const n = Gr.node.get(st.pop()!);
    if (!n || !n.partOf) continue;
    for (const p of n.partOf)
      if (!out.has(p)) {
        out.add(p);
        st.push(p);
      }
  }
  return out;
}

/* ---------- path tracing (research C3): BFS on unit weights over the directed flow graph; anastomoses (and reversed flow) only when
     the direct route is blocked ---------- */
function flowGraph(system: string, vs: Str, side: string | null, collateral: boolean) {
  const Gr = graph(),
    adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    const l = adj.get(a);
    if (!l!.includes(b)) l!.push(b);
  };
  if (system === 'nerve') {
    for (const n of Gr.node.values()) {
      if (n.parents) for (const p of n.parents) link(p, n.id);
      if (n.type === 'nerve') {
        if (n.parent) link(n.parent, n.id);
        for (const s of n.src!) link(s, n.id);
      }
      if ((n.type === 'muscle' || n.type === 'area' || n.type === 'function') && n.inn)
        for (const e of parseInn(n.inn)) link(e.nerve, n.id);
    }
    return adj;
  }
  const sys = system === 'lymph' ? 'lymph' : 'blood';
  const on = (v: string) => vs.includes(v);
  const drop = new Set<string>(),
    extra: [string, string, string | null][] = [];
  if (on('bovine-arch')) {
    drop.add('aortic-arch>common-carotid>L');
    extra.push(['brachiocephalic-trunk', 'common-carotid', 'L']);
  }
  if (on('lusoria')) {
    drop.add('brachiocephalic-trunk>subclavian>R');
    extra.push(['aortic-arch', 'subclavian', 'R']);
  }
  if (on('left-dominance')) {
    drop.add('right-coronary>posterior-interventricular>');
    extra.push(['circumflex', 'posterior-interventricular', null]);
  }
  if (on('codominance')) extra.push(['circumflex', 'posterior-interventricular', null]);
  if (on('imv-into-smv')) {
    drop.add('inferior-mesenteric-vein>splenic-vein>');
    extra.push(['inferior-mesenteric-vein', 'superior-mesenteric-vein', null]);
  }
  if (on('high-radial')) {
    drop.add('brachial>radial-artery>');
    extra.push(['axillary-3', 'radial-artery', null]);
  }
  if (on('persistent-median-artery')) {
    extra.push(['anterior-interosseous-artery', 'median-artery', null]);
    extra.push(['median-artery', 'superficial-palmar-arch', null]);
  }
  const sideOk = (s: string | null) => !s || !side || s === side;
  for (const e of Gr.edges) {
    if (e.sys !== sys || (e.fetal && system !== 'fetal') || !sideOk(e.side) || drop.has(`${e.a}>${e.b}>${e.side || ''}`)) continue;
    link(e.a, e.b);
    if (collateral) link(e.b, e.a);
  }
  for (const [a, b, s] of extra)
    if (sideOk(s)) {
      link(a, b);
      if (collateral) link(b, a);
    }
  if (collateral && sys === 'blood')
    for (const [a, b] of Gr.anast) {
      link(a, b);
      link(b, a);
    }
  return adj;
}
/** BFS from a to b avoiding nodes → {path, count (shortest paths, capped at 3)} */
function bfs(adj: Map<string, string[]>, a: string, b: string, avoid: Set<string>): { path: string[] | null; count: number } {
  if (avoid.has(a) || avoid.has(b)) return { path: null, count: 0 };
  const prev = new Map<string, string | null>([[a, null]]),
    dist = new Map([[a, 0]]),
    cnt = new Map([[a, 1]]),
    q = [a];
  for (let i = 0; i < q.length && i < 20000; i++) {
    const x = q[i];
    for (const y of adj.get(x!) || []) {
      if (avoid.has(y)) continue;
      if (!dist.has(y)) {
        dist.set(y, dist.get(x!)! + 1);
        prev.set(y, x!);
        cnt.set(y, cnt.get(x!)!);
        q.push(y);
      } else if (dist.get(y) === dist.get(x!)! + 1) cnt.set(y, Math.min(3, cnt.get(y)! + cnt.get(x!)!));
    }
  }
  if (!dist.has(b)) return { path: null, count: 0 };
  const path: string[] = [];
  for (let x: string | null = b; x !== null; x = prev.get(x) as string | null) path.unshift(x);
  return { path, count: Math.min(3, cnt.get(b)!) };
}
function trace(m: TraceM, vs: Str) {
  const system = m.system || 'blood',
    avoid = new Set(m.avoid || []),
    stops = [m.from].concat(m.via || [], [m.to]);
  const leg = (collateral: boolean) => {
    const adj = flowGraph(system, vs, m.side || null, collateral);
    let path = [m.from],
      count = 1;
    for (let i = 0; i + 1 < stops.length; i++) {
      const r = bfs(adj, stops[i]!, stops[i + 1]!, avoid);
      if (!r.path) return null;
      path = path.concat(r.path.slice(1));
      count = Math.min(3, count * r.count);
    }
    return { path, count };
  };
  let r = leg(false),
    coll = 0;
  if (!r && system !== 'nerve' && system !== 'lymph') {
    r = leg(true);
    coll = r ? 1 : 0;
  }
  return r ? { path: r.path, count: r.count, collateral: coll } : { path: null, count: 0, collateral: 0 };
}
function reach(a: string, b: string, system: string, vs: Str) {
  const r = bfs(flowGraph(system, vs, null, false), a, b, new Set());
  return !!r.path;
}

/* ---------- the model: tables walked by the core's checker (the SAME tables travel in INDEX, as they did to the former Python twin (tests/fixtures/parity/lib_anatomy.json)) ---------- */
const VIS_SITES = [
  'optic-nerve-L',
  'optic-nerve-R',
  'chiasm-central',
  'chiasm-lateral-L',
  'chiasm-lateral-R',
  'optic-tract-L',
  'optic-tract-R',
  'meyer-loop-L',
  'meyer-loop-R',
  'parietal-radiation-L',
  'parietal-radiation-R',
  'occipital-L',
  'occipital-R',
];
const SEGMENTS_WINTER = [
  'hand',
  'forearm',
  'upper-arm',
  'forearm-hand',
  'total-arm',
  'foot',
  'leg',
  'thigh',
  'foot-leg',
  'total-leg',
  'head-neck',
  'trunk',
];
const numxs = (ks: Str) => {
  const o: Record<string, string> = {};
  for (const k of ks) o[k] = 'numx';
  return o;
};
const SCHEMA: Readonly<Record<string, Table>> = {
  common: {
    mode: 'enum:lesion|query|trace|rom|biomech|regions|visual|cord!',
    variants: { $list: 'id', max: 16 },
    labels: { $list: { $obj: { id: 'id!', key: 'key!' } }, max: 200 },
    lang: 'enum:en|la',
  },
  lesion: {
    lesions: {
      $req: true,
      $list: { $obj: { at: { $req: true, $list: 'expr', min: 1, max: 8 }, completeness: 'numx', avulsion: 'bool' } },
      min: 1,
      max: 24,
    },
    pick: 'numx',
    compare: 'numx',
    findings: { $list: 'expr', max: 40 },
  },
  query: {
    facts: { $list: { $obj: { id: 'id!', rel: 'enum:' + RELS.join('|') + '!', from: 'id!', to: 'expr!' } }, max: 40 },
    quiz: {
      $obj: {
        rel: 'enum:' + RELS.join('|') + '!',
        from: 'expr',
        to: 'expr',
        choices: { $req: true, $list: 'expr', min: 2, max: 12 },
        pick: 'numx!',
      },
    },
    of: 'id',
  },
  trace: {
    system: 'enum:blood|fetal|lymph|nerve',
    from: 'id!',
    to: 'id!',
    via: { $list: 'id', max: 8 },
    avoid: { $list: 'id', max: 16 },
    side: 'enum:L|R',
  },
  rom: {
    joint: 'id',
    dof: 'id',
    source: 'enum:aaos|ama',
    measured: 'numx',
    beighton: { $obj: numxs(['pinkyL', 'pinkyR', 'thumbL', 'thumbR', 'elbowL', 'elbowR', 'kneeL', 'kneeR', 'palms']) },
    age: 'numx',
    prepubertal: 'bool',
  },
  biomech: {
    lever: {
      $obj: {
        muscleArm: 'numx!',
        muscleAngle: 'numx',
        loads: { $req: true, $list: { $obj: { f: 'numx!', arm: 'numx!' } }, min: 1, max: 8 },
      },
    },
    hip: { $obj: { bw: 'numx!', limbFrac: 'numx', abArm: 'numx', wArm: 'numx', abAngle: 'numx', caneForce: 'numx', caneArm: 'numx' } },
    niosh: {
      $obj: {
        load: 'numx',
        H: 'numx!',
        V: 'numx!',
        D: 'numx!',
        A: 'numx',
        F: 'numx',
        duration: 'enum:short|moderate|long',
        coupling: 'enum:good|fair|poor',
      },
    },
    segment: { $obj: { name: 'enum:' + SEGMENTS_WINTER.join('|') + '!', bodyMass: 'numx', length: 'numx' } },
    arm: { $obj: { a: 'numx!', b: 'numx!', angle: 'numx', from: 'numx', to: 'numx', steps: 'numx' } },
  },
  regions: {
    image: { $req: true, $list: 'pos', min: 2, max: 2 },
    regions: {
      $req: true,
      $list: {
        $obj: {
          structure: 'id!',
          polygon: { $list: 'fin', max: 400 },
          polyline: { $list: 'fin', max: 400 },
          width: 'pos',
          circle: { $list: 'fin', min: 3, max: 3 },
          z: 'int:0:99',
        },
      },
      min: 1,
      max: 100,
    },
    x: 'numx!',
    y: 'numx!',
    target: 'id',
    accept: 'enum:exact|part-of-up|part-of-down',
    tol: 'numx',
  },
  visual: { lesions: { $req: true, $list: 'enum:' + VIS_SITES.join('|'), min: 1, max: 16 }, pick: 'numx', combine: 'bool' },
  cord: {
    level: 'enum:' + SEGS.slice(0, 30).join('|') + '!',
    side: 'enum:L|R',
    kind: 'enum:hemisection|complete|central|anterior|posterior!',
    extent: 'numx',
  },
};
const MODES = ['lesion', 'query', 'trace', 'rom', 'biomech', 'regions', 'visual', 'cord'];
const VIS_DEFECTS = [
  'monocular-L',
  'monocular-R',
  'bitemporal-hemianopia',
  'nasal-hemianopia-L',
  'nasal-hemianopia-R',
  'homonymous-hemianopia-left',
  'homonymous-hemianopia-right',
  'superior-quadrantanopia-left',
  'superior-quadrantanopia-right',
  'inferior-quadrantanopia-left',
  'inferior-quadrantanopia-right',
  'macular-sparing',
];
const SECTORS = ['L-TS', 'L-TI', 'L-NS', 'L-NI', 'R-TS', 'R-TI', 'R-NS', 'R-NI'];
const CORD_OUT = ['umn', 'lmn', 'dcml', 'stt', 'dcmlFrom', 'sttFrom', 'sttFromHi', 'babinski', 'band']
  .flatMap(k => [k + '.L', k + '.R'])
  .concat(['level', 'armsWorse', 'sttBandTo', 'bladder']);
const OUTS: Readonly<Record<string, Readonly<Record<Kind, Str>>>> = {
  lesion: {
    scalar: [
      'pick',
      'paralysed',
      'weak',
      'areasLost',
      'areasPartial',
      'reflexesAbnormal',
      'signs',
      'ulnarClaw',
      'discriminators',
      'bestFinding',
      'variantRisk',
      'completeness',
    ],
    series: ['segLoss'],
    scene: ['muscles', 'tree', 'ladder'],
  },
  query: { scalar: ['correct', 'answers', 'answerIndex', 'rootLo', 'rootHi', 'rootCount'], series: [], scene: ['ladder'] },
  trace: { scalar: ['found', 'length', 'steps', 'paths', 'collateral', 'variantRisk'], series: [], scene: ['route'] },
  rom: {
    scalar: ['normMin', 'normMax', 'measured', 'pctNorm', 'limited', 'hypermobile', 'beighton', 'beightonCut', 'beightonPositive'],
    series: [],
    scene: ['goniometer'],
  },
  biomech: {
    scalar: [
      'muscleForce',
      'jrf',
      'jrfX',
      'jrfY',
      'jrfAngle',
      'ma',
      'leverClass',
      'hipW',
      'hipAbductor',
      'hipJrf',
      'hipJrfBw',
      'hipJrfAngle',
      'rwl',
      'li',
      'hm',
      'vm',
      'dm',
      'am',
      'fm',
      'cm',
      'massFrac',
      'mass',
      'comFrac',
      'comDist',
      'momentArmAt',
      'lengthAt',
      'excursion',
      'peakAngle',
    ],
    series: ['angle', 'momentArm', 'muscleLength'],
    scene: ['lever', 'arm'],
  },
  regions: { scalar: ['hit', 'hits', 'correct', 'distance', 'nearMiss'], series: [], scene: ['regions'] },
  visual: {
    scalar: SECTORS.map(s => 'field.' + s).concat(
      VIS_DEFECTS.map(d => 'defect.' + d),
      ['rapd.L', 'rapd.R', 'lost'],
    ),
    series: [],
    scene: ['fields'],
  },
  cord: { scalar: CORD_OUT, series: [], scene: ['section'] },
};

/** the index of the data the checkers need (ids and their types, levels, movements, the output names…): the former Python twin (tests/fixtures/parity/lib_anatomy.json)
      embeds this SAME JSON (tests/lib_anatomy.js checks that the two copies are identical) */
let IDX: Idx | null = null;
function index(): Idx {
  if (IDX) return IDX;
  const Gr = graph(),
    types: Record<string, string> = {},
    levels: Record<string, string[]> = {},
    dofs: Record<string, string[]> = {},
    of = { muscle: [] as string[], reflex: [] as string[], area: [] as string[], fn: [] as string[], nerve: [] as string[] },
    cn: string[] = [];
  for (const n of Gr.node.values()) {
    types[n.id] = n.type;
    if (n.type === 'nerve') {
      levels[n.id] = n.levels!;
      of.nerve.push(n.id);
      if (n.cn) cn.push(n.id);
    }
    if (n.type === 'joint') dofs[n.id] = n.dofs!;
    if (n.type === 'muscle') of.muscle.push(n.id);
    if (n.type === 'reflex') of.reflex.push(n.id);
    if (n.type === 'area') of.area.push(n.id);
    if (n.type === 'function') of.fn.push(n.id);
  }
  const rom: { aaos: Nums; ama: Nums } = { aaos: {}, ama: {} };
  for (const r of SRC.rom) {
    const [k, a, b] = r.split('|');
    if (a !== '') rom.aaos[k!] = +a!;
    if (b !== '') rom.ama[k!] = +b!;
  }
  const variants: Record<string, string> = {};
  for (const [k, v] of Object.entries(VARIANTS)) variants[k] = v.kind;
  IDX = {
    types,
    levels,
    dofs,
    movers: Object.keys(Gr.movers).sort(),
    muscles: of.muscle,
    reflexes: of.reflex,
    areas: of.area,
    fns: of.fn,
    nerves: of.nerve,
    cranial: cn,
    signs: Object.keys(SIGNS),
    dermatomes: DERMS,
    segs: SEGS,
    variants,
    rom,
    rel: REL,
    lesionable: LESIONABLE,
    schema: SCHEMA,
    modes: MODES,
    outs: OUTS,
    issues: ISSUES,
    findingGroups: FINDING_GROUPS,
  };
  return IDX;
}

/* ---------- the model checker (the same order, codes and messages as the former Python twin (tests/fixtures/parity/lib_anatomy.json)) ---------- */
const NOT_KNOWN = 'not a structure of anatomy@1';
function checkSpec(spec: unknown) {
  const { P, E, W } = C.problems();
  const m = isObj(spec) ? spec.model : undefined;
  const kinds = ['scalar', 'series', 'scene'];
  if (!isObj(m)) {
    E('format', 'model', 'not an object');
    C.checkOutputs(spec, ID, kinds, () => {}, E, W);
    return P;
  }
  const I = index(),
    mode = MODES.includes(m.mode as string) ? (m.mode as string) : null;
  C.walk(m, Object.assign({}, SCHEMA.common, mode ? SCHEMA[mode] : {}), 'model', E, W);
  if (mode) extra(mode, m, I, E, W);
  C.checkOutputs(
    spec,
    ID,
    kinds,
    (o, at) => {
      if (mode && !outputKnown(mode, o, m, I)) E('output', at + '.of', `${mode} computes no ${o.kind} "${o.of}"`);
    },
    E,
    W,
  );
  return P;
}
function typeMsg(types: Str, t: string) {
  return `needs ${types.join(' or ')}, not ${t}`;
}
function checkRef(v: unknown, p: string, types: Str | '*', I: Idx, E: Emit) {
  // a structure id of one of the types ('*' any)
  if (typeof v !== 'string' || !C.ID_RE.test(v)) return false;
  const t = has(I.types, v) ? I.types[v] : undefined;
  if (!t) {
    E('unknown-structure', p, NOT_KNOWN);
    return false;
  }
  if (types !== '*' && !types.includes(t)) {
    E('wrong-type', p, typeMsg(types, t));
    return false;
  }
  return true;
}
function checkTo(rel: string, v: unknown, p: string, I: Idx, E: Emit) {
  // the other end of a relation: a structure, a joint.dof, or one of the relation's words
  const want = I.rel[rel]!.to;
  if (typeof v !== 'string' || !v.trim()) return;
  if (want === 'dof') {
    const [j, d] = v.split('.');
    if (!has(I.dofs, j!) || !I.dofs[j!]!.includes(d!) || v.split('.').length !== 2)
      E('unknown-dof', p, 'not a movement (joint.dof) of anatomy@1');
    return;
  }
  if (typeof want === 'string' && want.startsWith('word:')) {
    const ws = want.slice(5).split('|');
    if (!ws.includes(v)) E('enum', p, 'one of ' + ws.join(', '));
    return;
  }
  if (!C.ID_RE.test(v)) {
    E('value', p, C.kindMsg('id')!);
    return;
  }
  checkRef(v, p, want as Str | '*', I, E);
}
function isFinding(name: string, I: Idx) {
  const i = name.indexOf('.');
  if (i < 0) return false;
  const g = name.slice(0, i),
    k = name.slice(i + 1);
  const G = {
    muscle: I.muscles,
    loss: I.muscles,
    move: I.movers,
    reflex: I.reflexes,
    area: I.areas,
    fn: I.fns,
    dermatome: I.dermatomes,
    sign: I.signs,
    nerve: I.nerves,
  };
  return has(G, g) && G[g as keyof typeof G].includes(k);
}
function extra(mode: string, m: Rec, I: Idx, E: Emit, W: Emit) {
  if (Array.isArray(m.variants))
    m.variants.forEach((v, i) => {
      const p = `model.variants[${i}]`;
      if (typeof v !== 'string' || !C.ID_RE.test(v)) return;
      if (!has(I.variants, v)) E('unknown-variant', p, 'not a known variant');
      else if (I.variants[v] !== mode) W('variant-unused', p, `has no effect in ${mode} mode`);
    });
  if (Array.isArray(m.variants) && m.variants.includes('left-dominance') && m.variants.includes('codominance'))
    E('inconsistent', 'model.variants', 'left-dominance and codominance exclude each other');
  if (Array.isArray(m.variants) && m.variants.includes('prefixed-plexus') && m.variants.includes('postfixed-plexus'))
    E('inconsistent', 'model.variants', 'prefixed-plexus and postfixed-plexus exclude each other');
  if (Array.isArray(m.labels))
    m.labels.forEach((l, i) => {
      if (isObj(l)) checkRef(l.id, `model.labels[${i}].id`, '*', I, E);
    });
  if (mode === 'lesion') {
    const L = Array.isArray(m.lesions) ? m.lesions : [];
    L.forEach((les, i) => {
      if (!isObj(les) || !Array.isArray(les.at)) return;
      let anyRoot = false as boolean;
      les.at.forEach((s, j) => {
        const p = `model.lesions[${i}].at[${j}]`;
        if (typeof s !== 'string' || !s.trim()) return;
        const { id, level } = parseAt(s);
        if (!C.ID_RE.test(id)) {
          E('value', p, 'needs a structure id, or id@level for a nerve');
          return;
        }
        const t = has(I.types, id) ? I.types[id] : undefined;
        if (!t) {
          E('unknown-structure', p, NOT_KNOWN);
          return;
        }
        if (!I.lesionable.includes(t)) {
          E('wrong-type', p, `a ${t} is not a lesion site (a root, a trunk, a division, a cord, a nerve or a site)`);
          return;
        }
        if (t === 'root') anyRoot = true;
        if (level !== null) {
          if (t !== 'nerve') E('unknown-level', p, 'only a nerve has levels');
          else if (!I.levels[id]!.includes(level))
            E('unknown-level', p, `${id} has no level "${level}" (one of ${I.levels[id]!.join(', ')})`);
        }
      });
      if (les.avulsion === true && !anyRoot) W('inconsistent', `model.lesions[${i}].avulsion`, 'only a root can be avulsed');
    });
    const n = L.length;
    for (const k of ['pick', 'compare'])
      if (isNum(m[k]) && (!Number.isInteger(m[k]) || m[k] < 0 || m[k] >= n))
        E('value', 'model.' + k, `needs an index of model.lesions (0 to ${n - 1})`);
    if (Array.isArray(m.findings))
      m.findings.forEach((f, i) => {
        if (typeof f === 'string' && f.trim() && !isFinding(f, I))
          E(
            'unknown-finding',
            `model.findings[${i}]`,
            'not a finding of lesion mode (muscle., move., reflex., area., fn., dermatome., sign., nerve.)',
          );
      });
  } else if (mode === 'query') {
    const ids = new Set();
    if (Array.isArray(m.facts))
      m.facts.forEach((f, i) => {
        if (!isObj(f)) return;
        const p = `model.facts[${i}]`;
        if (typeof f.id === 'string') {
          if (ids.has(f.id)) E('value', p + '.id', 'duplicate id');
          ids.add(f.id);
        }
        if (!has(I.rel, f.rel as string)) return;
        checkRef(f.from, p + '.from', I.rel[f.rel as string]!.from, I, E);
        checkTo(f.rel as string, f.to, p + '.to', I, E);
      });
    const q = m.quiz;
    if (isObj(q) && has(I.rel, q.rel as string)) {
      const hf = typeof q.from === 'string' && q.from.trim() !== '',
        ht = typeof q.to === 'string' && q.to.trim() !== '';
      if (hf === ht) E('inconsistent', 'model.quiz', 'needs from or to (one of them): the choices fill the other');
      else {
        if (hf) checkRef(q.from, 'model.quiz.from', I.rel[q.rel as string]!.from, I, E);
        else checkTo(q.rel as string, q.to, 'model.quiz.to', I, E);
        if (Array.isArray(q.choices))
          q.choices.forEach((c, i) => {
            const p = `model.quiz.choices[${i}]`;
            if (typeof c !== 'string' || !c.trim()) return;
            if (hf) checkTo(q.rel as string, c, p, I, E);
            else checkRef(c, p, I.rel[q.rel as string]!.from, I, E);
          });
        if (isNum(q.pick) && Array.isArray(q.choices) && (!Number.isInteger(q.pick) || q.pick < 0 || q.pick >= q.choices.length))
          E('value', 'model.quiz.pick', `needs an index of model.quiz.choices (0 to ${q.choices.length - 1})`);
      }
    }
    if (m.of !== undefined) checkRef(m.of, 'model.of', '*', I, E);
  } else if (mode === 'trace') {
    const sys = m.system || 'blood';
    const TT = {
      blood: ['artery', 'vein', 'heart', 'bed'],
      fetal: ['artery', 'vein', 'heart', 'bed'],
      lymph: ['lymph', 'vein'],
      nerve: ['root', 'trunk', 'division', 'cord', 'nerve', 'muscle', 'area', 'function'],
    };
    const T = typeof sys === 'string' && has(TT, sys) ? TT[sys as keyof typeof TT] : [];
    const okF = checkRef(m.from, 'model.from', T, I, E),
      okT = checkRef(m.to, 'model.to', T, I, E);
    if (okF && okT && m.from === m.to) E('inconsistent', 'model.to', 'is the same as model.from');
    if (Array.isArray(m.via)) m.via.forEach((v, i) => checkRef(v, `model.via[${i}]`, T, I, E));
    if (Array.isArray(m.avoid))
      m.avoid.forEach((v, i) => {
        if (checkRef(v, `model.avoid[${i}]`, T, I, E) && (v === m.from || v === m.to))
          E('inconsistent', `model.avoid[${i}]`, 'blocks the start or the end');
      });
  } else if (mode === 'rom') {
    if ((m.joint !== undefined) !== (m.dof !== undefined)) E('value', m.joint === undefined ? 'model.joint' : 'model.dof', 'missing');
    else if (m.joint !== undefined && checkRef(m.joint, 'model.joint', ['joint'], I, E) && typeof m.dof === 'string') {
      if (!I.dofs[m.joint as string]!.includes(m.dof)) E('unknown-dof', 'model.dof', `${m.joint as string} has no movement "${m.dof}"`);
      else if (
        (m.source === undefined || has(I.rom, m.source as string)) &&
        !has(I.rom[(m.source || 'aaos') as 'aaos'], (m.joint as string) + '.' + m.dof)
      )
        E('no-rom', 'model.dof', `the ${(m.source as string) || 'aaos'} table has no value for ${m.joint as string}.${m.dof}`);
    }
    if (m.joint === undefined && m.beighton === undefined) E('value', 'model', 'needs joint and dof, or beighton');
  } else if (mode === 'biomech') {
    if (!['lever', 'hip', 'niosh', 'segment', 'arm'].some(k => m[k] !== undefined))
      E('value', 'model', 'needs lever, hip, niosh, segment or arm');
  } else if (mode === 'regions') {
    const img = Array.isArray(m.image) && m.image.length === 2 && m.image.every(isNum) ? m.image : null;
    const R = Array.isArray(m.regions) ? m.regions : [];
    R.forEach((r, i) => {
      if (!isObj(r)) return;
      const p = `model.regions[${i}]`;
      checkRef(r.structure, p + '.structure', '*', I, E);
      const shapes = ['polygon', 'polyline', 'circle'].filter(k => r[k] !== undefined);
      if (shapes.length !== 1) {
        E('region', p, 'needs one of polygon, polyline, circle');
        return;
      }
      const k = shapes[0]!,
        v = r[k];
      if (!Array.isArray(v) || !v.every(isNum)) return;
      if (k === 'polygon' && (v.length < 6 || v.length % 2)) {
        E('region', p + '.polygon', 'needs at least 3 x, y pairs');
        return;
      }
      if (k === 'polyline' && (v.length < 4 || v.length % 2)) {
        E('region', p + '.polyline', 'needs at least 2 x, y pairs');
        return;
      }
      if (k === 'polyline' && r.width === undefined) E('region', p + '.width', 'missing (the stroke width of a polyline, in pixels)');
      const pts = k === 'circle' ? [v[0]! - v[2]!, v[1]! - v[2]!, v[0]! + v[2]!, v[1]! + v[2]!] : v;
      if (img && pts.some((x, j) => x < 0 || x > img[j % 2]!)) E('region', p + '.' + k, 'outside the image');
      if (k === 'circle' && !(v[2]! > 0)) E('region', p + '.circle', 'needs a radius > 0');
      if (k === 'polygon' && selfCrossing(v)) E('region', p + '.polygon', 'crosses itself');
    });
    if (m.target !== undefined && checkRef(m.target, 'model.target', '*', I, E) && !R.some(r => isObj(r) && r.structure === m.target))
      W('inconsistent', 'model.target', 'no region shows this structure itself');
  }
}
/** a simple polygon test: two non-adjacent edges that cross (proper intersection) */
function selfCrossing(v: readonly number[]) {
  const n = v.length / 2;
  if (n < 4) return false;
  const P = (i: number): [number, number] => [v[2 * (i % n)]!, v[2 * (i % n) + 1]!];
  const orient = (a: [number, number], b: [number, number], c: [number, number]) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = P(i),
        b = P(i + 1),
        c = P(j),
        d = P(j + 1);
      if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return true;
    }
  return false;
}
function outputKnown(mode: string, o: Rec, m: Rec, I: Idx) {
  const of = o.of as string,
    O = I.outs[mode]!;
  if (o.kind !== 'scalar') return O[o.kind as Kind].includes(of);
  if (O.scalar.includes(of)) return true;
  if (of.startsWith('issue.')) return I.issues[mode]!.includes(of.slice(6));
  if (mode === 'lesion') return of.startsWith('differs.') ? isFinding(of.slice(8), I) : isFinding(of, I);
  if (mode === 'query') {
    if (of.startsWith('fact.')) return Array.isArray(m.facts) && m.facts.some(f => isObj(f) && f.id === of.slice(5));
    if (of.startsWith('root.')) return I.segs.includes(of.slice(5));
    return false;
  }
  if (mode === 'trace') return (of.startsWith('via.') && has(I.types, of.slice(4))) || (of.startsWith('pos.') && has(I.types, of.slice(4)));
  return false;
}

/** every expression of the model: [source, path, local names] in the schema's order (the same as the former Python twin exprs (tests/fixtures/parity/lib_anatomy.json)) */
function exprs(spec: unknown) {
  const out: [string, string, string[]][] = [],
    m = isObj(spec) ? spec.model : null;
  if (!isObj(m) || !MODES.includes(m.mode as string)) return out;
  const visit = (v: unknown, kd: TableNode | undefined, p: string): void => {
    if (v === undefined || kd === undefined) return;
    if (typeof kd === 'string') {
      if (kd.replace('!', '') === 'numx' && typeof v === 'string') out.push([v, p, []]);
      return;
    }
    if (kd.$obj) {
      if (isObj(v)) for (const k of Object.keys(kd.$obj)) visit(v[k], kd.$obj[k], p + '.' + k);
      return;
    }
    if (kd.$list !== undefined && Array.isArray(v))
      v.forEach((x, i) => {
        visit(x, kd.$list, `${p}[${i}]`);
      });
  };
  const T = SCHEMA[m.mode as string];
  for (const k of Object.keys(T!)) visit(m[k], T![k], 'model.' + k);
  return out;
}
/** the string keys the model names: its labels */
function keys(spec: unknown) {
  const m = isObj(spec) ? spec.model : null,
    out: [string, string][] = [];
  if (isObj(m) && Array.isArray(m.labels))
    m.labels.forEach((l, i) => {
      if (isObj(l) && typeof l.key === 'string') out.push([l.key, `model.labels[${i}].key`]);
    });
  return out;
}

/* ---------- evaluation of the model's numbers ---------- */
function prepare(spec: unknown): Prepared {
  const fns = new Map<string, NumFn>();
  for (const [src] of exprs(spec)) if (!fns.has(src)) fns.set(src, C.cx(src));
  return { fns };
}
function resolver(prepared: Prepared | null | undefined, env: Rec) {
  const fns = prepared ? prepared.fns : new Map<string, NumFn>();
  return (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? (fns.get(v) || C.cx(v))(env) : NaN);
}
const getter =
  (R: (v: unknown) => number): Getter =>
  (o, k, d) =>
    isObj(o) && o[k] !== undefined ? R(o[k]) : d === undefined ? NaN : d;
function issueBag(): Bag {
  const b: Nums = {};
  return {
    add(c) {
      b[c] = (b[c] || 0) + 1;
    },
    out: b,
  };
}
function labeller(m: Model): Lab {
  const Gr = graph(),
    keyOf = new Map<string, string>();
  if (Array.isArray(m.labels)) for (const l of m.labels) if (isObj(l)) keyOf.set(l.id as string, l.key as string);
  return id => {
    if (keyOf.has(id)) return { key: keyOf.get(id) };
    const n = Gr.node.get(id);
    if (n && n.type === 'root') return { s: id }; // a segment's code (C5) reads the same in every language
    const s = (m.lang === 'la' && n && n.la) || (n ? n.en : id);
    return { s: s.slice(0, 64) };
  };
}
const idx = (R: number, v: number, n: number) => {
  const k = Math.round(R);
  return fin(R) && Math.abs(R - k) < 1e-9 && k >= 0 && k < n ? k : -1;
};

/* ===================================================== lesion ===================================================== */
function runLesion(m: LesionM, g: Getter, I: Bag, lab: Lab): RunOut {
  const o: Nums = {},
    ox: Record<string, unknown> = o,
    sr: Record<string, number[]> = {},
    sc: Record<string, SceneData> = {};
  const L = m.lesions,
    vs = (m.variants || []).filter(v => VARIANTS[v] && VARIANTS[v].kind === 'lesion');
  const pick = idx(g(m, 'pick', 0), 0, L.length);
  if (pick < 0) {
    I.add('range');
    return { o, sr, sc };
  }
  const comp = (l: Lesion) => {
    const v = g(l, 'completeness', 1);
    if (!(v >= 0 && v <= 1)) I.add('range');
    return v;
  };
  const evalAt = (i: number, v: Str) => evaluate(L[i]!, v, comp(L[i]!));
  const F = evalAt(pick, vs);
  o.pick = pick;
  o.completeness = fin(comp(L[pick]!)) ? Math.min(1, Math.max(0, comp(L[pick]!))) : 1;
  for (const k of ['paralysed', 'weak', 'areasLost', 'areasPartial', 'reflexesAbnormal', 'signs', 'ulnarClaw'] as const) o[k] = F[k];
  ox.F = F;
  if (vs.length && !sameFindings(F, evalAt(pick, []))) I.add('variant-sensitive');
  let risk = 0;
  for (const [v, d] of Object.entries(VARIANTS))
    if (
      d.kind === 'lesion' &&
      !vs.includes(v) &&
      !(v === 'prefixed-plexus' && vs.includes('postfixed-plexus')) &&
      !(v === 'postfixed-plexus' && vs.includes('prefixed-plexus'))
    ) {
      if (!sameFindings(F, evalAt(pick, vs.concat([v])))) risk++;
    }
  o.variantRisk = risk;
  const all = L.map((l, i) => (i === pick ? F : evalAt(i, vs)));
  for (let i = 0; i < L.length; i++) if (i !== pick && sameFindings(F, all[i]!)) I.add('level-ambiguous');
  const cmp = idx(g(m, 'compare', NaN), 0, L.length);
  if (m.compare !== undefined) {
    if (cmp < 0) I.add('range');
    else {
      o.discriminators = diffCount(F, all[cmp]!);
      ox.G = all[cmp];
    }
  }
  if (Array.isArray(m.findings) && m.findings.length && L.length >= 2) {
    // the finding whose values split the candidate lesions most
    let best = -1,
      bestN = 1;
    m.findings.forEach((f: string, i) => {
      const n = new Set(all.map(A => findingValue(A, f))).size;
      if (n > bestN) {
        best = i;
        bestN = n;
      }
    });
    o.bestFinding = best;
  }
  const lossBy = SEGS.map(s => {
    const one = cutsOf(L[pick]!);
    return one.roots.has(s) ? 1 : 0;
  });
  sr.segLoss = lossBy;
  sc.muscles = sceneMuscles(F, lab);
  sc.tree = sceneTree(L[pick]!, F, lab);
  sc.ladder = sceneLadder(F, cutsOf(L[pick]!).roots, lab);
  return { o, sr, sc };
}
function sceneMuscles(F: Findings, lab: Lab) {
  const Gr = graph(),
    rows: string[] = [];
  for (const n of Gr.node.values()) if (n.type === 'muscle' && !n.parts!.length && F.muscle[n.id]! > 0) rows.push(n.id);
  const N = Math.min(rows.length, 60),
    s = C.scene([-0.5, 10, -N - 0.5, 1]);
  rows.slice(0, N).forEach((id, i) => {
    const st = F.muscle[id];
    s.pt(0, -i, { r: 5, c: st === 2 ? 'bad' : 'warn' });
    s.seg(0.5, -i, 0.5 + 3 * F.loss[id]!, -i, { c: st === 2 ? 'bad' : 'warn', w: 6 });
    s.txt(4, -i, lab(id));
  });
  if (rows.length > N) s.txt(0, -N, { v: rows.length - N, c: 'muted' });
  return s.done();
}
function sceneLadder(F: Findings | null, roots: Set<string>, lab: Lab) {
  const s = C.scene([-1, 6, -31, 1]);
  SEGS.slice(0, 30).forEach((seg, i) => {
    const d = F ? F.dermatome[seg] : 0;
    const c = roots.has(seg) ? 'bad' : d ? 'warn' : 'muted';
    s.poly([0, -i, 1.6, -i, 1.6, -i - 0.85, 0, -i - 0.85], { c, fill: roots.has(seg) || d! > 0, closed: true });
    s.txt(2.2, -i - 0.4, Object.assign(lab(seg), { c: roots.has(seg) ? 'bad' : 'base' }));
  });
  return s.done();
}
/** the nerve tree of the lesion's family (brachial, lumbosacral, cervical, thoracic or cranial): layered by depth, cut nerves in red */
function sceneTree(lesion: Lesion, F: Findings, lab: Lab) {
  const Gr = graph(),
    L = cutsOf(lesion);
  let fam: string | null | undefined = null;
  for (const s of lesion.at || []) {
    const n = Gr.node.get(parseAt(s).id);
    if (!n) continue;
    if (n.fam) {
      fam = n.fam;
      break;
    }
    if (n.type === 'site' && n.nerves!.length) {
      fam = Gr.node.get(parseAt(n.nerves![0]!).id)!.fam;
      break;
    }
  }
  if (!fam) fam = 'brachial';
  const depth = new Map<string, number>(),
    nodes: string[] = [];
  const dOf = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const n = Gr.node.get(id);
    let d = 0;
    if (!n) d = 0;
    else if (n.type === 'root') d = 0;
    else if (n.parents) d = 1 + Math.max(...n.parents.map(dOf));
    else if (n.type === 'nerve') d = n.parent ? 1 + dOf(n.parent) : 1 + Math.max(0, ...n.src!.map(dOf));
    depth.set(id, d);
    return d;
  };
  for (const n of Gr.node.values())
    if ((n.type === 'nerve' || n.parents) && n.fam === fam && !(n.id === 'accessory-obturator')) nodes.push(n.id);
  const roots = new Set<string>();
  for (const id of nodes) {
    const n = Gr.node.get(id);
    for (const s of (n!.src || []).concat(n!.parents || [])) if (SEGS.includes(s)) roots.add(s);
  }
  const all = [...SEGS.filter(s => roots.has(s)), ...nodes];
  const layers: string[][] = [];
  for (const id of all) {
    const d = dOf(id);
    (layers[d] = layers[d] || []).push(id);
  }
  const pos = new Map<string, [number, number]>();
  let maxN = 1;
  layers.forEach((ids, d) => {
    ids.forEach((id, i) => pos.set(id, [d * 3, -i]));
    maxN = Math.max(maxN, ids.length);
  });
  const s = C.scene([-1, layers.length * 3 + 2, -maxN, 1]);
  const lost = (id: string) =>
    SEGS.includes(id) ? L.roots.has(id) : Gr.node.get(id)!.type === 'nerve' ? F.nerve[id]! >= LOST : L.cuts.has(id);
  const partial = (id: string) => !SEGS.includes(id) && Gr.node.get(id)!.type === 'nerve' && F.nerve[id]! >= WEAK;
  for (const id of all) {
    const n = Gr.node.get(id),
      [x, y] = pos.get(id)!;
    const ups = n!.type === 'nerve' ? (n!.parent ? [n!.parent] : n!.src) : n!.parents || [];
    for (const u of ups!)
      if (pos.has(u)) {
        const [ux, uy] = pos.get(u)!;
        s.seg(ux, uy, x, y, { c: lost(id) ? 'bad' : partial(id) ? 'warn' : 'muted' });
      }
  }
  for (const id of all) {
    const [x, y] = pos.get(id)!;
    s.pt(x, y, { r: 4, c: lost(id) ? 'bad' : partial(id) ? 'warn' : 'base' });
    s.txt(x + 0.2, y + 0.25, lab(id));
  }
  return s.done();
}

/* ===================================================== query ===================================================== */
function runQuery(m: QueryM, g: Getter, I: Bag, lab: Lab): RunOut {
  const o: Nums = {},
    sc: Record<string, SceneData> = {},
    vs = (m.variants || []).filter(v => VARIANTS[v] && VARIANTS[v].kind === 'lesion');
  if (Array.isArray(m.facts))
    for (const f of m.facts as readonly Fact[]) {
      const v = relation(f.rel, f.from, f.to, vs);
      if (!fin(v)) I.add('uncurated');
      o['fact.' + f.id] = v;
    }
  if (isObj(m.quiz)) {
    const q = m.quiz,
      ask = q.from ? 'to' : 'from';
    const vals = q.choices.map(c => (ask === 'to' ? relation(q.rel, q.from!, c, vs) : relation(q.rel, c, q.to!, vs)));
    if (vals.some(v => !fin(v))) I.add('uncurated');
    const k = idx(g(q, 'pick'), 0, q.choices.length);
    if (k < 0) I.add('range');
    o.correct = k < 0 || !fin(vals[k]) ? NaN : vals[k]!;
    o.answers = vals.filter(v => v === 1).length;
    o.answerIndex = vals.indexOf(1);
  }
  const roots = new Set<string>();
  if (m.of) {
    const Gr = graph(),
      n = Gr.node.get(m.of),
      w: Nums = {};
    const addR = (r: string, x: number) => {
      if (r) {
        roots.add(r);
        w[r] = Math.max(w[r] || 0, x);
      }
    };
    if (n!.type === 'nerve')
      n!.roots!.forEach(r => {
        addR(r, 1);
      });
    else if (n!.type === 'reflex')
      n!.roots!.forEach(t => {
        addR(t.replace(/[*~]$/, ''), t.endsWith('*') ? 2 : 1);
      });
    else if (n!.type === 'root') addR(n!.id, 1);
    else
      for (const id of n!.parts && n!.parts.length ? n!.parts : [n!.id])
        for (const e of parseInn(Gr.node.get(id)?.inn)) for (const r of e.roots) addR(r.r, r.w);
    const nums = [...roots].map(segNo);
    o.rootCount = roots.size;
    o.rootLo = nums.length ? Math.min(...nums) : NaN;
    o.rootHi = nums.length ? Math.max(...nums) : NaN;
    for (const s of SEGS) o['root.' + s] = w[s] || 0;
    if (!roots.size && !(n!.type === 'nerve' && n!.cranial) && !(n!.type === 'muscle' && (n!.inn || n!.parts!.length))) I.add('uncurated');
  }
  sc.ladder = sceneLadder(null, roots, lab);
  return { o, sr: {}, sc };
}

/* ===================================================== trace ===================================================== */
function runTrace(m: TraceM, g: Getter, I: Bag, lab: Lab): RunOut {
  const o: Nums = {},
    ox: Record<string, unknown> = o,
    sc: Record<string, SceneData> = {},
    vs = (m.variants || []).filter(v => VARIANTS[v] && VARIANTS[v].kind === 'trace');
  const r = trace(m, vs);
  o.found = r.path ? 1 : 0;
  o.length = r.path ? r.path.length : NaN;
  o.steps = r.path ? r.path.length - 1 : NaN;
  o.paths = r.count;
  o.collateral = r.collateral;
  if (!r.path) I.add('no-path');
  if (r.collateral) I.add('collateral');
  if (vs.length) {
    const b = trace(m, []);
    if (JSON.stringify(b.path) !== JSON.stringify(r.path)) I.add('variant-sensitive');
  }
  let risk = 0;
  for (const [v, d] of Object.entries(VARIANTS))
    if (d.kind === 'trace' && !vs.includes(v)) {
      const b = trace(m, vs.concat([v]));
      if (JSON.stringify(b.path) !== JSON.stringify(r.path)) risk++;
    }
  o.variantRisk = risk;
  const P = (ox.path = r.path || []),
    N = Math.min(P.length, 60),
    s = C.scene([-1, 8, -N, 1]);
  P.slice(0, N).forEach((id, i) => {
    s.pt(0, -i, { r: 5, c: i === 0 || i === P.length - 1 ? 'hi' : 'base' });
    if (i) s.seg(0, -i + 0.85, 0, -i + 0.15, { arrow: true, c: 'muted' });
    s.txt(0.6, -i, lab(id));
  });
  sc.route = s.done();
  return { o, sr: {}, sc };
}

/* ===================================================== rom ===================================================== */
/* Beighton score (Beighton P, Solomon L, Soskolne CL, Ann Rheum Dis 1973;32:413), cut-offs of the 2017 hEDS criteria (Malfait F et al.,
     Am J Med Genet C 2017;175:8): ≥ 6 before puberty, ≥ 5 from puberty to 50 years, ≥ 4 over 50. */
function runRom(m: RomM, g: Getter, I: Bag): RunOut {
  const o: Nums = {},
    sc: Record<string, SceneData> = {},
    Ix = index();
  if (m.joint !== undefined) {
    const k = m.joint + '.' + m.dof!,
      max = Ix.rom[m.source || 'aaos'][k];
    o.normMin = 0;
    o.normMax = max!;
    const v = g(m, 'measured');
    if (fin(v)) {
      o.measured = v;
      o.pctNorm = (100 * v) / max!;
      if (v < 0 || v > 2 * max!) I.add('range');
      o.limited = v < 0.8 * max! ? 1 : 0;
      o.hypermobile = v > max! ? 1 : 0;
      if (o.limited) I.add('limited');
      if (o.hypermobile) I.add('hypermobile');
    }
    const s = C.scene([-1.2, 1.2, -1.2, 1.2]),
      rad = (d: number) => (d * Math.PI) / 180;
    s.seg(0, 0, 1, 0, { c: 'base', w: 3 });
    const arc: number[] = [];
    for (let i = 0; i <= 36; i++) {
      const a = rad((max! * i) / 36);
      arc.push(Math.cos(a) * 0.8, Math.sin(a) * 0.8);
    }
    s.poly(arc, { c: 'ok', closed: false });
    s.seg(0, 0, Math.cos(rad(max!)), Math.sin(rad(max!)), { c: 'ok', dash: true, v: max });
    if (fin(v)) s.seg(0, 0, Math.cos(rad(v)), Math.sin(rad(v)), { c: o.limited || o.hypermobile ? 'bad' : 'hi', w: 3, arrow: true, v });
    sc.goniometer = s.done();
  }
  if (isObj(m.beighton)) {
    const b = m.beighton;
    let n = 0,
      bad = false;
    for (const k of ['pinkyL', 'pinkyR', 'thumbL', 'thumbR', 'elbowL', 'elbowR', 'kneeL', 'kneeR', 'palms']) {
      const v = g(b, k, 0);
      if (v !== 0 && v !== 1) bad = true;
      else n += v;
    }
    if (bad) {
      I.add('range');
      o.beighton = NaN;
    } else {
      o.beighton = n;
      const age = g(m, 'age');
      o.beightonCut = m.prepubertal ? 6 : fin(age) && age > 50 ? 4 : 5;
      o.beightonPositive = n >= o.beightonCut ? 1 : 0;
    }
  }
  return { o, sr: {}, sc };
}

/* ===================================================== biomech ===================================================== */
/* Winter DA, Biomechanics and Motor Control of Human Movement 4e (2009) table 4.1 (from Dempster 1955): segment mass / body mass
     and the centre of mass from the proximal end / segment length */
const WINTER: Readonly<Record<string, readonly [number, number]>> = {
  hand: [0.006, 0.506],
  forearm: [0.016, 0.43],
  'upper-arm': [0.028, 0.436],
  'forearm-hand': [0.022, 0.682],
  'total-arm': [0.05, 0.53],
  foot: [0.0145, 0.5],
  leg: [0.0465, 0.433],
  thigh: [0.1, 0.433],
  'foot-leg': [0.061, 0.606],
  'total-leg': [0.161, 0.447],
  'head-neck': [0.081, 1.0],
  trunk: [0.497, 0.5],
};
/* NIOSH revised lifting equation (Waters TR, Putz-Anderson V, Garg A, Fine LJ, Ergonomics 1993;36:749; Applications Manual 1994):
     the frequency multiplier table [lifts/min] → [≤1 h V<75, ≤1 h V≥75, ≤2 h V<75, ≤2 h V≥75, ≤8 h V<75, ≤8 h V≥75] (verify against
     the Applications Manual table 5 before release) */
const NIOSH_F = [
  [0.2, 1, 1, 0.95, 0.95, 0.85, 0.85],
  [0.5, 0.97, 0.97, 0.92, 0.92, 0.81, 0.81],
  [1, 0.94, 0.94, 0.88, 0.88, 0.75, 0.75],
  [2, 0.91, 0.91, 0.84, 0.84, 0.65, 0.65],
  [3, 0.88, 0.88, 0.79, 0.79, 0.55, 0.55],
  [4, 0.84, 0.84, 0.72, 0.72, 0.45, 0.45],
  [5, 0.8, 0.8, 0.6, 0.6, 0.35, 0.35],
  [6, 0.75, 0.75, 0.5, 0.5, 0.27, 0.27],
  [7, 0.7, 0.7, 0.42, 0.42, 0.22, 0.22],
  [8, 0.6, 0.6, 0.35, 0.35, 0.18, 0.18],
  [9, 0.52, 0.52, 0.3, 0.3, 0, 0.15],
  [10, 0.45, 0.45, 0.26, 0.26, 0, 0.13],
  [11, 0.41, 0.41, 0, 0.23, 0, 0],
  [12, 0.37, 0.37, 0, 0.21, 0, 0],
  [13, 0, 0.34, 0, 0, 0, 0],
  [14, 0, 0.31, 0, 0, 0, 0],
  [15, 0, 0.28, 0, 0, 0, 0],
];
function nioshFM(F: number, dur: string, V: number) {
  const col = ({ short: 1, moderate: 3, long: 5 } as Nums)[dur]! + (V >= 75 ? 1 : 0);
  if (F <= 0.2) return NIOSH_F[0]![col];
  if (F > 15) return 0;
  for (let i = 1; i < NIOSH_F.length; i++)
    if (F <= NIOSH_F[i]![0]!) {
      const a = NIOSH_F[i - 1],
        b = NIOSH_F[i],
        t = (F - a![0]!) / (b![0]! - a![0]!);
      return a![col]! + t * (b![col]! - a![col]!);
    }
  return 0;
}
function runBiomech(m: BiomechM, g: Getter, I: Bag): RunOut {
  const o: Nums = {},
    sr: Record<string, number[]> = {},
    sc: Record<string, SceneData> = {},
    rad = (d: number) => (d * Math.PI) / 180,
    deg = (r: number) => (r * 180) / Math.PI;
  if (isObj(m.lever)) {
    // a segment in static equilibrium about the joint (Nordin M, Frankel VH, Basic Biomechanics 5e 2021, ch. 2)
    const lv = m.lever,
      d = g(lv, 'muscleArm'),
      phi = rad(g(lv, 'muscleAngle', 90));
    const loads = lv.loads.map(l => [g(l, 'f'), g(l, 'arm')]);
    const M = loads.reduce((a, [f, r]) => a + f! * r!, 0),
      Ftot = loads.reduce((a, [f]) => a + f!, 0),
      dp = d * Math.sin(phi);
    if (!(Math.abs(dp) > 1e-12) || !loads.every(([f, r]) => fin(f) && fin(r))) {
      I.add('impossible');
      o.muscleForce = NaN;
    } else {
      const Fm = M / dp;
      o.muscleForce = Fm;
      if (Fm < 0) I.add('model');
      o.jrfX = Fm * Math.cos(phi);
      o.jrfY = Ftot - Fm * Math.sin(phi); // the force of the proximal segment on the distal one, y up
      o.jrf = Math.hypot(o.jrfX, o.jrfY);
      o.jrfAngle = deg(Math.atan2(Math.abs(o.jrfX), Math.abs(o.jrfY)));
      const r0 = loads[0]![1];
      o.ma = dp / r0!;
      o.leverClass = r0! < 0 ? 1 : d < r0! ? 3 : 2;
      const s = C.scene([-0.05, Math.max(...loads.map(l => Math.abs(l[1]!))) + 0.05, -0.15, 0.2]);
      s.seg(0, 0, Math.max(...loads.map(l => l[1]!)), 0, { c: 'base', w: 4 });
      s.pt(0, 0, { r: 6, c: 'hi' });
      s.seg(d, 0, d + 0.1 * Math.cos(Math.PI - phi), 0.1 * Math.sin(phi), { c: 'ok', arrow: true, v: Math.round(Fm) });
      for (const [f, r] of loads) s.seg(r!, 0, r!, -0.1, { c: 'bad', arrow: true, v: f });
      sc.lever = s.done();
    }
  }
  if (isObj(m.hip)) {
    // single-leg stance (Pauwels F 1935; Nordin & Frankel 5e): moments about the stance hip
    const h = m.hip,
      BW = g(h, 'bw'),
      fr = g(h, 'limbFrac', 0.161),
      a = g(h, 'abArm', 0.05),
      b = g(h, 'wArm', 0.1),
      al = rad(g(h, 'abAngle', 70)),
      cf = g(h, 'caneForce', 0),
      ca = g(h, 'caneArm', 0);
    const W = BW * (1 - fr);
    o.hipW = W;
    if (!(a > 0) || !(BW > 0)) {
      I.add('impossible');
    } else {
      const Fab = (W * b - cf * ca) / a;
      o.hipAbductor = Fab;
      if (Fab < 0) I.add('model');
      const Jy = W - cf + Fab * Math.sin(al),
        Jx = Fab * Math.cos(al);
      o.hipJrf = Math.hypot(Jx, Jy);
      o.hipJrfBw = o.hipJrf / BW;
      o.hipJrfAngle = deg(Math.atan2(Jx, Jy));
    }
  }
  if (isObj(m.niosh)) {
    const n = m.niosh,
      H = g(n, 'H'),
      V = g(n, 'V'),
      D = g(n, 'D'),
      A = g(n, 'A', 0),
      F = g(n, 'F', 0.2);
    if (H < 25 || D < 25) I.add('clamped');
    if (H > 63 || V > 175 || V < 0 || D > 175 || A > 135 || F > 15) I.add('range');
    o.hm = H > 63 ? 0 : 25 / Math.max(H, 25);
    o.vm = V > 175 || V < 0 ? 0 : 1 - 0.003 * Math.abs(V - 75);
    o.dm = D > 175 ? 0 : 0.82 + 4.5 / Math.max(D, 25);
    o.am = A > 135 ? 0 : 1 - 0.0032 * A;
    o.fm = nioshFM(F, n.duration || 'short', V)!;
    o.cm = n.coupling === 'poor' ? 0.9 : n.coupling === 'fair' ? (V < 75 ? 0.95 : 1) : 1;
    o.rwl = 23 * o.hm * o.vm * o.dm * o.am * o.fm * o.cm;
    const ld = g(n, 'load');
    if (fin(ld)) o.li = o.rwl > 0 ? ld / o.rwl : NaN;
  }
  if (isObj(m.segment)) {
    const w = WINTER[m.segment.name];
    o.massFrac = w![0];
    o.comFrac = w![1];
    const bm = g(m.segment, 'bodyMass'),
      len = g(m.segment, 'length');
    if (fin(bm)) o.mass = w![0] * bm;
    if (fin(len)) o.comDist = w![1] * len;
  }
  if (isObj(m.arm)) {
    // a straight-line muscle from a point a on the proximal segment to b on the distal one (research C5)
    const ar = m.arm,
      a = g(ar, 'a'),
      b = g(ar, 'b'),
      f0 = g(ar, 'from', 0),
      f1 = g(ar, 'to', 150),
      n = Math.max(2, Math.min(2000, Math.round(g(ar, 'steps', 61))));
    if (!(a > 0 && b > 0) || !(f1 > f0)) {
      I.add('impossible');
    } else {
      const geo = (phi: number): [number, number] => {
        const al = rad(180 - phi),
          L = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(al));
        return [L > 1e-12 ? (a * b * Math.sin(al)) / L : 0, L];
      };
      sr.angle = [];
      sr.momentArm = [];
      sr.muscleLength = [];
      for (let i = 0; i < n; i++) {
        const p = f0 + ((f1 - f0) * i) / (n - 1),
          [d, L] = geo(p);
        sr.angle.push(p);
        sr.momentArm.push(d);
        sr.muscleLength.push(L);
      }
      const at = g(ar, 'angle', 90),
        [d, L] = geo(at);
      o.momentArmAt = d;
      o.lengthAt = L;
      o.excursion = geo(f0)[1] - geo(f1)[1];
      o.peakAngle = 180 - deg(Math.acos(Math.min(a, b) / Math.max(a, b)));
      if (at < 0 || at > 180) I.add('range');
      const s = C.scene([-b - 0.02, a + 0.02, -0.02, Math.max(a, b) + 0.02]),
        al = rad(180 - at);
      s.seg(0, 0, a, 0, { c: 'base', w: 4 });
      s.seg(0, 0, b * Math.cos(al), b * Math.sin(al), { c: 'base', w: 4 });
      s.pt(0, 0, { r: 6, c: 'hi' });
      s.seg(a, 0, b * Math.cos(al), b * Math.sin(al), { c: 'bad', w: 2, v: Math.round(d * 1000) / 1000 });
      sc.arm = s.done();
    }
  }
  return { o, sr, sc };
}

/* ===================================================== regions ===================================================== */
function inPoly(v: readonly number[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = v.length / 2 - 1; i < v.length / 2; j = i++) {
    const xi = v[2 * i],
      yi = v[2 * i + 1],
      xj = v[2 * j],
      yj = v[2 * j + 1];
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) c = !c;
  }
  return c;
}
function segDist(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1,
    dy = y2 - y1,
    L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)) : 0;
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}
function regionDist(r: Region, x: number, y: number) {
  // 0 inside, else the distance to the region
  if (r.circle) return Math.max(0, Math.hypot(x - r.circle[0]!, y - r.circle[1]!) - r.circle[2]!);
  const v = r.polygon || r.polyline,
    n = v!.length / 2;
  let d = Infinity;
  if (r.polygon && inPoly(v!, x, y)) return 0;
  for (let i = 0; i + 1 < n + (r.polygon ? 1 : 0); i++) {
    const j = (i + 1) % n;
    d = Math.min(d, segDist(x, y, v![2 * i]!, v![2 * i + 1]!, v![2 * j]!, v![2 * j + 1]!));
  }
  return r.polyline ? Math.max(0, d - r.width! / 2) : d;
}
function runRegions(m: RegionsM, g: Getter, I: Bag): RunOut {
  const o: Nums = {},
    sc: Record<string, SceneData> = {},
    Gr = graph(),
    x = g(m, 'x'),
    y = g(m, 'y'),
    tol = g(m, 'tol', 6),
    [W, H] = m.image;
  if (!fin(x) || !fin(y)) {
    I.add('range');
    return { o, sr: {}, sc };
  }
  if (x < 0 || y < 0 || x > W || y > H) I.add('range');
  const order = m.regions.map((r, i) => i).sort((a, b) => (m.regions[b]!.z || 0) - (m.regions[a]!.z || 0) || a - b);
  const hits = order.filter(i => regionDist(m.regions[i]!, x, y) <= (m.regions[i]!.polyline ? tol : 0));
  o.hit = hits.length ? hits[0]! : -1;
  o.hits = hits.length;
  if (m.target) {
    const t = m.target,
      acc = m.accept || 'exact';
    const ok = (id: string) =>
      id === t || (acc === 'part-of-up' && ancestors(id, Gr).has(t)) || (acc === 'part-of-down' && ancestors(t, Gr).has(id));
    o.correct = hits.length && ok(m.regions[hits[0]!]!.structure) ? 1 : 0;
    const ds = m.regions.filter(r => ok(r.structure)).map(r => regionDist(r, x, y));
    o.distance = ds.length ? Math.min(...ds) : NaN;
    o.nearMiss = !o.correct && o.distance <= 3 * tol ? 1 : 0;
  }
  const s = C.scene([0, W, 0, H]),
    fy = (v: readonly number[]) => v.map((q, i) => (i % 2 ? H - q : q));
  m.regions.forEach((r, i) => {
    const c = i === o.hit ? (o.correct === 0 ? 'bad' : 'ok') : r.structure === m.target ? 'hi' : 'muted';
    if (r.circle) s.circ(r.circle[0]!, H - r.circle[1]!, r.circle[2]!, { c, fill: i === o.hit });
    else s.poly(fy((r.polygon || r.polyline)!), { c, fill: !!r.polygon && i === o.hit, closed: !!r.polygon });
  });
  s.pt(x, H - y, { r: 5, c: 'hi' });
  sc.regions = s.done();
  return { o, sr: {}, sc };
}

/* ===================================================== visual pathway ===================================================== */
/* Gray42; standard neuro-ophthalmology: the nasal retina (temporal field) crosses in the chiasm; the inferior retina (superior field)
     runs in Meyer's loop through the temporal lobe; the superior retina (inferior field) in the parietal radiation; an occipital
     lesion spares the macula when the MCA collaterals supply the occipital pole. Sectors: eye L|R, T temporal / N nasal field,
     S superior / I inferior. */
const VIS: Readonly<Record<string, Str>> = {
  'optic-nerve-L': ['L-TS', 'L-TI', 'L-NS', 'L-NI'],
  'optic-nerve-R': ['R-TS', 'R-TI', 'R-NS', 'R-NI'],
  'chiasm-central': ['L-TS', 'L-TI', 'R-TS', 'R-TI'],
  'chiasm-lateral-L': ['L-NS', 'L-NI'],
  'chiasm-lateral-R': ['R-NS', 'R-NI'],
  'optic-tract-L': ['L-NS', 'L-NI', 'R-TS', 'R-TI'],
  'optic-tract-R': ['R-NS', 'R-NI', 'L-TS', 'L-TI'],
  'meyer-loop-L': ['L-NS', 'R-TS'],
  'meyer-loop-R': ['R-NS', 'L-TS'],
  'parietal-radiation-L': ['L-NI', 'R-TI'],
  'parietal-radiation-R': ['R-NI', 'L-TI'],
  'occipital-L': ['L-NS', 'L-NI', 'R-TS', 'R-TI'],
  'occipital-R': ['R-NS', 'R-NI', 'L-TS', 'L-TI'],
};
const DEFECT: Readonly<Record<string, Str>> = {
  'monocular-L': ['L-TS', 'L-TI', 'L-NS', 'L-NI'],
  'monocular-R': ['R-TS', 'R-TI', 'R-NS', 'R-NI'],
  'bitemporal-hemianopia': ['L-TS', 'L-TI', 'R-TS', 'R-TI'],
  'nasal-hemianopia-L': ['L-NS', 'L-NI'],
  'nasal-hemianopia-R': ['R-NS', 'R-NI'],
  'homonymous-hemianopia-right': ['L-NS', 'L-NI', 'R-TS', 'R-TI'],
  'homonymous-hemianopia-left': ['R-NS', 'R-NI', 'L-TS', 'L-TI'],
  'superior-quadrantanopia-right': ['L-NS', 'R-TS'],
  'superior-quadrantanopia-left': ['R-NS', 'L-TS'],
  'inferior-quadrantanopia-right': ['L-NI', 'R-TI'],
  'inferior-quadrantanopia-left': ['R-NI', 'L-TI'],
};
function runVisual(m: VisualM, g: Getter, I: Bag): RunOut {
  const o: Nums = {},
    sc: Record<string, SceneData> = {};
  let sites: Str;
  if (m.combine) sites = m.lesions;
  else {
    const k = idx(g(m, 'pick', 0), 0, m.lesions.length);
    if (k < 0) {
      I.add('range');
      return { o, sr: {}, sc };
    }
    sites = [m.lesions[k]!];
  }
  const lost = new Set();
  for (const s of sites) for (const q of VIS[s]!) lost.add(q);
  for (const q of SECTORS) o['field.' + q] = lost.has(q) ? 1 : 0;
  o.lost = lost.size;
  for (const [d, qs] of Object.entries(DEFECT)) o['defect.' + d] = qs.length === lost.size && qs.every(q => lost.has(q)) ? 1 : 0;
  o['defect.macular-sparing'] = sites.some(s => s.startsWith('occipital')) && sites.every(s => s.startsWith('occipital')) ? 1 : 0;
  o['rapd.L'] = sites.includes('optic-nerve-L') && !sites.includes('optic-nerve-R') ? 1 : 0;
  o['rapd.R'] = sites.includes('optic-nerve-R') && !sites.includes('optic-nerve-L') ? 1 : 0;
  const s = C.scene([-2.4, 2.4, -1.3, 1.3]);
  for (const [eye, cx] of [
    ['L', -1.15],
    ['R', 1.15],
  ] as const) {
    // the fields as the patient sees them: left of each circle = the patient's left
    for (const q of ['TS', 'TI', 'NS', 'NI']) {
      const left = (eye === 'L') === (q[0] === 'T'),
        up = q[1] === 'S';
      const a0 = left ? (up ? 90 : 180) : up ? 0 : 270,
        pts = [cx, 0];
      for (let i = 0; i <= 12; i++) {
        const a = ((a0 + (90 * i) / 12) * Math.PI) / 180;
        pts.push(cx + Math.cos(a), Math.sin(a));
      }
      s.poly(pts, { c: lost.has(eye + '-' + q) ? 'bad' : 'muted', fill: lost.has(eye + '-' + q), closed: true });
    }
    if (o['defect.macular-sparing']) s.circ(cx, 0, 0.15, { c: 'ok', fill: true });
    s.seg(cx, -1.05, cx, 1.05, { c: 'base', dash: true });
    s.seg(cx - 1.05, 0, cx + 1.05, 0, { c: 'base', dash: true });
  }
  sc.fields = s.done();
  return { o, sr: {}, sc };
}

/* ===================================================== spinal cord syndromes ===================================================== */
/* Gray42; research C1.14: corticospinal (decussates in the medullary pyramids: ipsilateral UMN signs below a cord lesion), dorsal
     columns (decussate in the medulla: ipsilateral loss below), spinothalamic (crosses in the anterior white commissure within 1–2
     segments of entry: contralateral loss from 1–2 segments below). Outputs are segment numbers (C1 = 1 … S5 = 30) or 0/1. */
function runCord(m: CordM, g: Getter, I: Bag): RunOut {
  const o: Nums = {},
    sc: Record<string, SceneData> = {},
    lvl = segNo(m.level),
    side = m.side || 'R',
    other = side === 'L' ? 'R' : 'L',
    k = m.kind;
  const ext = Math.max(1, Math.round(g(m, 'extent', 1)));
  if (k === 'hemisection' && !m.side) I.add('range');
  for (const s of ['L', 'R']) for (const f of ['umn', 'lmn', 'dcml', 'stt', 'babinski', 'band']) o[f + '.' + s] = 0;
  for (const s of ['L', 'R']) for (const f of ['dcmlFrom', 'sttFrom', 'sttFromHi']) o[f + '.' + s] = NaN;
  const below = (s: string, f: string, from: number, hi?: number) => {
    o[f + '.' + s] = 1;
    if (f === 'dcml') o['dcmlFrom.' + s] = from;
    if (f === 'stt') {
      o['sttFrom.' + s] = Math.min(30, from);
      o['sttFromHi.' + s] = Math.min(30, hi!);
    }
  };
  const motor = (s: string) => {
    o['umn.' + s] = 1;
    o['babinski.' + s] = 1;
    o['lmn.' + s] = 1;
  };
  if (k === 'hemisection') {
    motor(side);
    below(side, 'dcml', lvl);
    below(other, 'stt', lvl + 1, lvl + 2);
    o['band.' + side] = 1;
  } else if (k === 'complete') {
    for (const s of ['L', 'R']) {
      motor(s);
      below(s, 'dcml', lvl);
      below(s, 'stt', lvl + 1, lvl + 1);
      o['band.' + s] = 1;
    }
  } else if (k === 'anterior') {
    for (const s of ['L', 'R']) {
      motor(s);
      below(s, 'stt', lvl + 1, lvl + 1);
    }
  } else if (k === 'posterior') {
    for (const s of ['L', 'R']) below(s, 'dcml', lvl);
  } else if (k === 'central') {
    for (const s of ['L', 'R']) {
      o['umn.' + s] = 1;
      o['lmn.' + s] = 1;
      o['stt.' + s] = 1;
      o['sttFrom.' + s] = lvl;
      o['sttFromHi.' + s] = lvl;
    }
    o.sttBandTo = Math.min(30, lvl + ext - 1);
  }
  o.level = lvl;
  o.armsWorse = k === 'central' && lvl <= 9 ? 1 : 0;
  o.bladder = k === 'hemisection' ? 0 : k === 'posterior' ? 0 : 1;
  if (o.sttBandTo === undefined) o.sttBandTo = NaN;
  const s = C.scene([-1.4, 1.4, -1.2, 1.2]),
    circ: number[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i * Math.PI) / 24;
    circ.push(1.2 * Math.cos(a), 0.9 * Math.sin(a));
  }
  s.poly(circ, { c: 'base', closed: true });
  for (const sd of ['L', 'R']) {
    // drawn as seen from below (the patient's left on the left of the picture)
    const x = sd === 'L' ? -1 : 1;
    s.poly([0, 0.05, 0.12 * x, 0.85, 0.45 * x, 0.6], { c: o['dcml.' + sd] ? 'bad' : 'ok', fill: true, closed: true });
    s.poly([0.6 * x, 0.25, 1.05 * x, 0.3, 1.0 * x, -0.15, 0.65 * x, -0.1], { c: o['umn.' + sd] ? 'bad' : 'ok', fill: true, closed: true });
    s.poly([0.55 * x, -0.25, 0.95 * x, -0.3, 0.6 * x, -0.75, 0.3 * x, -0.6], {
      c: o['stt.' + sd] ? 'bad' : 'ok',
      fill: true,
      closed: true,
    });
  }
  sc.section = s.done();
  return { o, sr: {}, sc };
}

const RUN: Readonly<Record<string, RunFn | undefined>> = {
  lesion: runLesion,
  query: runQuery,
  trace: runTrace,
  rom: runRom,
  biomech: runBiomech,
  regions: runRegions,
  visual: runVisual,
  cord: runCord,
};
/** compute a model (numbers resolved with env) → {scalars, series, scenes, issues} */
function compute(model: Model, env?: Rec | null, prepared?: Prepared | null): Computed {
  const R = resolver(prepared, env || {}),
    g = getter(R),
    I = issueBag(),
    lab = labeller(model);
  const r = RUN[model.mode] ? RUN[model.mode]!(model as never, g, I, lab) : { o: {}, sr: {}, sc: {} };
  return { scalars: r.o, series: r.sr, scenes: r.sc, issues: I.out };
}
function scalarOf(res: Computed, mode: string, of: string): number {
  if (of.startsWith('issue.')) return res.issues[of.slice(6)] || 0;
  const o = res.scalars;
  if (has(o, of)) return o[of] as number;
  if (mode === 'lesion' && o.F) {
    if (of.startsWith('differs.')) {
      if (!o.G) return NaN;
      const a = findingValue(o.F as Findings, of.slice(8)),
        b = findingValue(o.G as Findings, of.slice(8));
      return fin(a) && fin(b) ? (a !== b ? 1 : 0) : NaN;
    }
    return findingValue(o.F as Findings, of);
  }
  if (mode === 'trace' && Array.isArray(o.path)) {
    if (of.startsWith('via.')) return o.found ? (o.path.includes(of.slice(4)) ? 1 : 0) : NaN;
    if (of.startsWith('pos.')) return o.found ? o.path.indexOf(of.slice(4)) : NaN;
  }
  return NaN;
}
/** run(spec, env, {prepared}) → {out: {<output id>: value}} */
function run(spec: Spec, env: Rec, opts?: { readonly prepared?: Prepared | null }) {
  const P = checkSpec(spec);
  if (C.hasErrors(P)) return { out: {} };
  const sp = spec as {
    readonly model: Model;
    readonly outputs: readonly { readonly id: string; readonly kind: Kind; readonly of: string }[];
  };
  const res = compute(sp.model, env, opts && opts.prepared),
    out: Record<string, unknown> = {};
  for (const o of sp.outputs) {
    if (o.kind === 'scalar') {
      const v = scalarOf(res, sp.model.mode, o.of);
      out[o.id] = fin(v) ? v : NaN;
    } else if (o.kind === 'series') out[o.id] = (res.series[o.of] || []).slice(0, C.MAX_POINTS);
    else out[o.id] = res.scenes[o.of] || { view: [-1, 1, -1, 1], items: [] };
  }
  return { out };
}
/** the data's own consistency problems (dangling references, unknown levels or movements…): the tests expect none */
function dataProblems() {
  const Gr = graph(),
    out = Gr.problems.slice();
  const { bad } = routeTable([]);
  for (const b of bad) out.push('no route for ' + b);
  return out;
}
function counts() {
  const Gr = graph(),
    c: Nums = { total: Gr.node.size };
  for (const n of Gr.node.values()) c[n.type] = (c[n.type] || 0) + 1;
  c.edges = Gr.edges.length;
  return c;
}

const { engine, simEngine } = C.makeEngine<Prepared>({ id: ID, checkSpec, run, prepare, scenes: true });
const API = Object.freeze({
  id: ID,
  checkSpec,
  exprs,
  keys,
  run,
  compute,
  engine: Object.freeze(engine),
  simEngine,
  table: {
    model: { $by: 'mode', $cases: Object.fromEntries(MODES.map(md => [md, Object.assign({}, SCHEMA.common, SCHEMA[md])])) },
    outputs: {
      $by: 'mode',
      $cases: Object.fromEntries(
        MODES.map(md => [
          md,
          { scalar: OUTS[md]!.scalar.concat((ISSUES[md] || []).map(i => 'issue.' + i)), series: OUTS[md]!.series, scene: OUTS[md]!.scene },
        ]),
      ),
    },
  }, // the form of the activity author (src/engines/kernel/schema.ts)
  // the engine's own functions and tables, for the tests
  index,
  graph,
  dataProblems,
  counts,
  evaluate,
  relation,
  trace,
  routeTable,
  nioshFM,
  WINTER,
  VARIANTS,
  SIGNS,
  segNo,
});
export default API;
/* i18n-ignore-end */
