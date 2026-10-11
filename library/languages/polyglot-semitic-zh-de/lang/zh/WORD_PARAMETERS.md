# Chinese (Mandarin) — the distinctive parameters of a word, per part of speech (R3, D14)

The map behind `language.json` → `wordFeatures`. Every declared parameter is stated by **every** word of its part of
speech (a value, or `{"none": "<why>"}`); `prominent` parameters are shown right under the word, in `order`.
Status: **declared** = existed before R3 · **added** = added by R3 (2026-10-11) · **n.a.** = considered and not a word
parameter here (the reason says where the information lives instead).

Chinese has no inflection (`zh.morph.isolating`): what other languages learn as forms of a word, Chinese learns as the
word's **companions** — its measure word, its negator, the aspect particles and complements it accepts, how it doubles,
what may follow it — plus what the script hides: the reading per meaning, the tones (and the toneless syllables), the
traditional characters and the northern 儿 form.

Values were checked against the word's own senses and examples, `chars.json` (readings from Make Me a Hanzi + Unihan
`kMandarin`, traditional forms from Unihan), the Wiktionary (kaikki.org) entries each word's `ref` names (measure
words, separable verbs marked 起⫽床) and standard usage; no zh dump is cached in `data/refcache/` yet, so the new
values were not machine-checked against one. Shared by every part of speech: `pinyin`, `trad` (top level), `readings`,
`tradPerSense`, `toneSandhi` (declared) and `neutralTone`, `erhua` (added).

## Shared by every part of speech

| parameter | why it is distinctive | prominent | status |
|---|---|---|---|
| `pinyin` (top level) | the reading is not visible in the characters, and the tones are part of the word (dictionary tones) | ✓ | declared |
| `trad` (top level) | the traditional characters of Taiwan, Hong Kong and Macau (開始, 結束) | ✓ | declared |
| `readings` | 多音字: a character read differently per meaning (长 cháng / zhǎng, 觉 jiào / jué), each reading with its senses | ✓ | declared |
| `tradPerSense` | one simplified character for several traditional ones (里 裡 / 里, 周 週 / 周), per sense | ✓ | declared |
| `toneSandhi` | the spoken tone of 一 / 不 inside the word (一个 yí gè, 不客气 bú kèqi); prominent for numbers | NUM ✓ | declared |
| `neutralTone` | which syllable is toneless and its tone alone: suffixes (子, 们, 么), particles, doubled kin words (妈妈), lexical cases (朋友 péngyou, 喜欢 xǐhuan — Taiwan often keeps the full tone); computed from the pinyin and `chars.json` | | added |
| `erhua` | the northern 儿 form and where it is said (玩儿, 一点儿, 这儿, Beijing 今儿); none, or a warning when 儿 makes another word (头儿 ‘boss’, 点儿 ‘a bit’) | | added |
| – | third-tone sandhi (你好 ní hǎo) | regular, from the tones of the neighbours: a pronunciation rule, not a word parameter | | n.a. (rule) |
| – | stroke order, components, radical | per character, in `chars.json` (§4.9), shown by the character tutor | | n.a. (`chars.json`) |
| – | mainland / Taiwan words (土豆 ‘potato’ / ‘peanut’) | a sense with its region, or a synonym with `region` | | n.a. (senses / synonyms) |

## NOUN

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `measure` | the measure word(s), most usual first: a noun cannot be counted or pointed at without one (一本书, 这张桌子); none for nouns that count themselves (天, 年), mass and time words, with the reason | ✓ | declared |
| 2 | `measurePerSense` | a meaning with its own measure word: 房子 house 栋 / flat 套 / room 间, 饭 rice 碗 / meal 顿, 电话 phone 部 / call 个, 通, 飞机 plane 架 / flight 班, 面包 bread 片, 块 / bun 个 | ✓ | added |
| 3 | `trad`, `tradPerSense` | see above | ✓ | declared |
| 4 | `pinyin`, `readings` | see above | ✓ | declared |
| 5 | `men` | nouns for people take 们 for a known group (朋友们); things never do (*书们) | | added |
| 6 | `locative` | how the noun becomes a place after 在 / 到 / 从: place word (在家), place or + 里 (在学校 / 在学校里), needs a localizer (在桌子上), needs 这儿 / 那儿 (在朋友那儿); none for time words, colours, abstract nouns | | added |
| 7 | `neutralTone`, `erhua`, `toneSandhi` | see above | | added / declared |
| – | gender, case, plural forms | Chinese has none (`zh.nom.nogender`, `zh.nom.nocase`); number is shown by numbers and 们 | | n.a. |
| – | the noun suffix 子 / 头 / 儿 | visible in the word; its tone in `neutralTone`, the 儿 form in `erhua` | | n.a. |
| – | time word before the verb (今天我…), duration after it | a property of all time words (`zh.syntax.duration`), recorded as `locative: none` (a time word) | | n.a. (class) |

## VERB

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `separable` | 离合词: verb + object with the **insertion point** between them (`inserts`: 了, 过, 个, a length, a result: 洗了个澡, 睡了八个小时的觉); such a verb takes no further object (跟他见面) | ✓ | declared (`inserts` added) |
| 2 | `neg` | 不 (will, habit, states), 没 (what did not happen, 有) or both | ✓ | declared |
| 3 | `aspect` | which of 了, 过, 着, 在 it takes; none for the copula, auxiliaries, pure states (记得, 在) | ✓ | added |
| 4 | `complements` | the usual resultative (吃完, 洗干净), directional (走进, 想起来) and potential (吃不下, 睡不着, 来得及) complements | ✓ | added |
| 5 | `verbKind` | action / state / psych (takes 很: 很喜欢, 很想) / change of state (醒, 到, 忘) / auxiliary (会, 要, 想, 打算) / copula (是) — it decides aspect, doubling, 得 and 很 | ✓ | added |
| 6 | `redup` | AA / A一A (看看, 等一等), ABAB (参观参观), AAB for separable verbs (洗洗澡); none for states, changes, auxiliaries | | added |
| 7 | `degreeComplement` | verb + 得 + comment, with the verb repeated after an object (他开车开得很稳) | | added |
| 8 | `object` | what follows: no object (separable verbs), a noun, a place without a preposition (去北京), a verb (想去), a clause (记得…), two objects (叫他老王), a pivot (请他来) | | added |
| 9 | `trad`, `tradPerSense`, `pinyin`, `readings` | see above | ✓ | declared |
| 10 | `neutralTone`, `erhua`, `toneSandhi` | see above | | added / declared |
| – | tense, person, number forms | none: the verb never changes (`zh.verb.noagreement`, `zh.verb.nopast`) | | n.a. |
| – | 把 / 被 | sentence constructions open to most transitive action verbs (`zh.syntax.ba`, `zh.syntax.bei`); taught on grammar pages, not a property worth stating per word yet | | n.a. (grammar) |
| – | verbal measure words (次, 遍, 下) | a property of the measure word (`kind: verbal`), not of the verb | | n.a. (CLF) |

## ADJ

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `predicative` | predicate without 是 (他很高, *他是高), or a 区别词 that is not a predicate (所有, 最后) | ✓ | added |
| 2 | `degree` | takes 很 / 非常 (an unstressed 很 is the plain link); none for phrases that have one (很好, 还好); no degree adverb for 区别词 and 一样 | ✓ | added |
| 3 | `redup` | AA(的) (大大的, 慢慢), AABB (高高兴兴), ABB (红彤彤, 绿油油) | ✓ | added |
| 4 | `attributive` | directly (早饭), directly or with 的 (大房子 / 大的房子), with 的 (漂亮的房间), not before a noun alone (多, 少 → 很多人) | | added |
| 5 | `trad`, `tradPerSense`, `pinyin`, `readings` | see above | ✓ | declared |
| 6 | `neutralTone`, `erhua`, `toneSandhi` | see above | | added / declared |
| – | comparative and superlative forms | analytic for every adjective: 比 / 更 / 最 + adjective (`zh.syntax.comparison`) | | n.a. |
| – | agreement | none (`zh.adj.noagreement`) | | n.a. |
| – | adjective as a change of state (红了, 冷了) | open to every gradable adjective with 了: a grammar rule | | n.a. |

## ADV

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `position` | after the subject, before the verb (他也去); some open the sentence (当然, 也许); a few follow the verb | ✓ | declared |
| 2 | `withNeg` | the order with 不 / 没 and what it means: 都不 ‘none’ / 不都 ‘not all’, 很不好 / 不太好, 也不 (never *不也), 已经不 vs 还没 | ✓ | added |
| 3 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua`, `toneSandhi` | see above | | declared / added |

## CLF (measure words)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `counts` | what it counts, with examples: by shape (张 flat, 条 long and winding, 根 long and thin), by kind (本, 辆, 家), container (杯, 碗) | ✓ | added |
| 2 | `kind` | general / sortal / container / partitive / unit / collective / verbal | ✓ | declared |
| 3 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua`, `toneSandhi` | see above | | declared / added |
| – | doubling (个个, 张张 ‘every one’) | any one-syllable measure word can double: a rule | | n.a. |

## NUM

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `withMeasure` | how it counts a noun: 两 before a measure word, 二 in counting and inside numbers (十二个), 一个 yí gè, 半个 / 一个半; none for 零 and 二 alone | ✓ | added |
| 2 | `ordinal` | 第 + number (第三, 第几); none for ordinals, 两 (→ 第二), 零, fractions | ✓ | added |
| 3 | `toneSandhi` | 一 and 不 change their tone in speech | ✓ | declared |
| 4 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua` | see above | | declared / added |
| – | banker's numerals (壹, 贰) | a script fact of the numbers (`zh.script.numerals`), shown on the numerals page | | n.a. |

## PRON

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `plural` | 我们 (咱们 includes the listener), 他们 / 她们 / 它们; none for 您 (no spoken plural), plural and question words | ✓ | added |
| 2 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua`, `toneSandhi` | see above | | declared / added |
| – | case forms (I / me) | none: one form as subject and object | | n.a. |
| – | 他 / 她 / 它 | one syllable tā in speech, three characters: separate words | | n.a. (separate lexemes) |

## DET

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `withMeasure` | 这 / 那 / 哪 / 每 + measure word (这本书, 每个人); 这些, 一些, 有些 without (些 is a measure) | ✓ | added |
| 2 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua`, `toneSandhi` | see above | | declared / added |

## ADP (coverbs and localizers)

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `position` | coverbs before the noun (从北京), localizers after it (桌子上, 三年以来) | ✓ | declared |
| 2 | `alsoVerb` | still a full verb: 给 ‘give’, 跟 ‘follow’, 上 / 下 ‘go up / down’, 离 ‘leave’, 比 ‘compare’ | ✓ | added |
| 3 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua`, `toneSandhi` | see above | | declared / added |

## CCONJ

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `joins` | 和 joins nouns only (never clauses); 还是 choices in a question, 或者 in a statement; 但是, 所以, 然后 join clauses | ✓ | added |
| 2 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua`, `toneSandhi` | see above | | declared / added |

## SCONJ

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `pair` | the partner in the second clause (因为 … 所以, 虽然 … 但是, 如果 … 就) | ✓ | declared |
| 2 | `position` | before or after the subject of its clause (因为他病了 / 他因为病了) | | added |
| 3 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua`, `toneSandhi` | see above | | declared / added |

## PART

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `position` | after the verb (了, 着, 过), sentence-final (吗, 吧, 了), after a modifier (的), after a noun (们) | ✓ | declared |
| 2 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua`, `toneSandhi` | see above (particles are toneless: `neutralTone`) | | declared / added |

## INTJ

| # | parameter | why it is distinctive | prominent | status |
|---|---|---|---|---|
| 1 | `formality` | informal (拜拜, 回头见, 不好意思), neutral (你好, 谢谢), polite (您好, 劳驾, 打扰一下) | ✓ | added |
| 2 | `trad`, `tradPerSense`, `pinyin`, `readings`, `neutralTone`, `erhua`, `toneSandhi` | see above | | declared / added |
