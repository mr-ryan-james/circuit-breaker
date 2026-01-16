# Spanish B1/B2 Grammar Lessons - Review Document

**Total: 150 lessons**
**Format: Teach (~2 min) → Examples (~2 min) → Quiz (15 questions)**
**Card duration: 10 minutes each**

## Global Prompt Rules (applies to every lesson)

<!-- GLOBAL_PROMPT_PREFIX_START -->
GLOBAL RULES (apply to every lesson):
- Keep this interactive: ask ONE question at a time and wait for my answer.
- Don’t dump a wall of text. Keep prompts compact and action-oriented.
- Timebox the whole lesson to ~10 minutes; keep explanations concise and move quickly into practice.
- Keep score out of 15 (show running score like 3/15).
- Correct immediately with a 1–2 sentence explanation + the corrected Spanish.
- Accept minor accent/typo mistakes as “close”, but show the correct spelling/accents.
- In PHASE 1, include one common mistake and the corrected version.
- In PHASE 2, give 5 examples WITH English translations. Bold the target structure.
- In PHASE 2, include at least one example using **vosotros** and one using **nosotros** (when the concept allows it).
- In PHASE 3, prefer this mix (unless the concept demands otherwise):
  - 8 fill-in-the-blank
  - 4 translation
  - 3 error correction
- In PHASE 3, keep questions single-sentence and unambiguous (avoid cases with multiple “equally right” answers unless you accept them).
- In PHASE 3, include at least one question that requires a **vosotros** form (when the concept allows it).
- If I answer in English when the task expects Spanish production, ask me to answer in Spanish.
- After question 15: summarize the top 3 patterns to fix and give 3 fresh example sentences.
- Use Castilian Spanish with vosotros throughout.
<!-- GLOBAL_PROMPT_PREFIX_END -->

---

## 1. SUBJUNCTIVE MOOD (15 cards)

### Present Subjunctive Formation (3)

---

#### 1. `learning.spanish.grammar.subjunctive_present_formation.v1`

**Activity:** Present Subjunctive - Regular Formation (-AR, -ER, -IR)

**Prompt:**
```
LESSON: Present Subjunctive - Regular Verb Formation

PHASE 1 - TEACH:
Explain how to form the present subjunctive for regular verbs:
- Start with the yo form of present indicative
- Drop the -o ending
- Add opposite endings: -AR verbs get -e endings, -ER/-IR verbs get -a endings
- Full paradigm: -AR (hable, hables, hable, hablemos, habléis, hablen)
- Full paradigm: -ER/-IR (coma, comas, coma, comamos, comáis, coman)

PHASE 2 - EXAMPLES:
Give 5 example sentences using regular verbs in present subjunctive:
1. Quiero que (tú) hables más despacio.
2. Es importante que comamos bien.
3. Espero que escriban pronto.
4. Dudo que trabajen mañana.
5. Me alegra que vivas aquí.

PHASE 3 - QUIZ (15 questions):
Mix of fill-in-the-blank and conjugation. Test -AR, -ER, -IR verbs.
Correct each answer immediately. Use Castilian Spanish with vosotros.
```

---

#### 2. `learning.spanish.grammar.subjunctive_present_irregulars.v1`

**Activity:** Present Subjunctive - Irregular Verbs & Stem Changers

**Prompt:**
```
LESSON: Present Subjunctive - Irregular Verbs

PHASE 1 - TEACH:
Cover the key irregular verbs in present subjunctive:
- SABER: sepa, sepas, sepa, sepamos, sepáis, sepan
- IR: vaya, vayas, vaya, vayamos, vayáis, vayan
- SER: sea, seas, sea, seamos, seáis, sean
- ESTAR: esté, estés, esté, estemos, estéis, estén
- HABER: haya, hayas, haya, hayamos, hayáis, hayan
- DAR: dé, des, dé, demos, deis, den
Also cover stem-changers (e→ie, o→ue, e→i) and how they work in subjunctive.
Important nuance:
- -AR/-ER stem-changers do NOT change in nosotros/vosotros.
- -IR stem-changers DO change in nosotros/vosotros (e→i, o→u), e.g. dormir → durmamos/durmáis; pedir → pidamos/pidáis.

PHASE 2 - EXAMPLES:
5 sentences using irregular subjunctive verbs with translations.

PHASE 3 - QUIZ (15 questions):
Focus on irregular verbs. Mix formats: conjugation, fill-in-blank, translation.
Use Castilian Spanish with vosotros.
```

---

#### 3. `learning.spanish.grammar.subjunctive_present_spelling_changes.v1`

**Activity:** Present Subjunctive - Spelling Changes (-CAR, -GAR, -ZAR)

**Prompt:**
```
LESSON: Present Subjunctive - Spelling Change Verbs

PHASE 1 - TEACH:
Explain spelling changes in present subjunctive to preserve pronunciation:
- -CAR verbs: c → qu (buscar → busque, busques...)
- -GAR verbs: g → gu (pagar → pague, pagues...)
- -ZAR verbs: z → c (cruzar → cruce, cruces...)
  Note: some verbs combine spelling change + stem change (empezar → empiece).
- -GER/-GIR verbs: g → j (coger → coja, escoger → escoja)
- -GUIR verbs: gu → g (seguir → siga)

PHASE 2 - EXAMPLES:
5 sentences demonstrating spelling changes in context.

PHASE 3 - QUIZ (15 questions):
Test spelling change verbs. Include common verbs: buscar, pagar, cruzar, llegar, tocar, comenzar, coger, elegir, seguir (bonus: empezar as spelling+stem change).
Use Castilian Spanish with vosotros.
```

---

### Subjunctive Triggers (6)

---

#### 4. `learning.spanish.grammar.subjunctive_triggers_volition.v1`

**Activity:** Subjunctive Triggers - Wishes, Commands, Requests

**Prompt:**
```
LESSON: Subjunctive with Volition (WEIRDO - W)

PHASE 1 - TEACH:
Explain that subjunctive is triggered when expressing:
- Wishes: querer que, desear que, esperar que, preferir que
- Commands: mandar que, ordenar que, exigir que
- Requests: pedir que, rogar que, suplicar que
- Advice: aconsejar que, recomendar que, sugerir que
- Permission: permitir que, prohibir que, dejar que
Key: Different subjects required (Yo quiero que TÚ vengas)

PHASE 2 - EXAMPLES:
5 sentences with different volition triggers and translations.

PHASE 3 - QUIZ (15 questions):
Fill-in-blank and translation. Test all volition trigger types.
Use Castilian Spanish with vosotros.
```

---

#### 5. `learning.spanish.grammar.subjunctive_triggers_emotion.v1`

**Activity:** Subjunctive Triggers - Emotion & Feelings

**Prompt:**
```
LESSON: Subjunctive with Emotion (WEIRDO - E)

PHASE 1 - TEACH:
Subjunctive follows expressions of emotion about someone else's actions:
- Happiness: alegrarse de que, estar contento de que
- Sadness/regret: sentir (mucho) que, lamentar que, es una pena que
- Surprise: sorprender que, es sorprendente que
- Fear: temer que, tener miedo de que
- Anger/Annoyance: molestar que, fastidiar que, enojar que
- Like/Dislike: gustar que, encantar que, odiar que
Note: “Siento que…” can also mean “I feel/think that…” (more like an opinion), which often goes indicative. For regret/emotion, prefer “Siento (mucho) que…” + subjunctive.

PHASE 2 - EXAMPLES:
5 sentences expressing emotions about others' actions.

PHASE 3 - QUIZ (15 questions):
Mix of emotion triggers. Include both verb + que and es + adjective + que patterns.
Use Castilian Spanish with vosotros.
```

---

#### 6. `learning.spanish.grammar.subjunctive_triggers_doubt.v1`

**Activity:** Subjunctive Triggers - Doubt, Denial, Possibility

**Prompt:**
```
LESSON: Subjunctive with Doubt & Denial (WEIRDO - D)

PHASE 1 - TEACH:
Subjunctive follows expressions of doubt or denial:
- Doubt: dudar que, no estar seguro de que
- Denial: negar que, no es verdad que, no es cierto que
- Disbelief: no creer que, no pensar que (BUT creer que, pensar que → indicative)
- Possibility: es posible que, es probable que, puede que
- Maybe: quizás, tal vez, acaso (subjunctive when uncertainty emphasized)

PHASE 2 - EXAMPLES:
5 sentences with doubt/denial triggers. Show contrast with indicative.

PHASE 3 - QUIZ (15 questions):
Include tricky pairs (creer que vs no creer que). Test the doubt/certainty distinction.
Use Castilian Spanish with vosotros.
```

---

#### 7. `learning.spanish.grammar.subjunctive_purpose_clauses.v1`

**Activity:** Subjunctive in Purpose Clauses

**Prompt:**
```
LESSON: Subjunctive with Purpose Conjunctions

PHASE 1 - TEACH:
These conjunctions ALWAYS take subjunctive (purpose/goal = not yet real):
- para que (so that, in order that)
- a fin de que (in order that)
- con el objetivo de que (with the goal that)
- sin que (without) - always subjunctive
Note: para + infinitive when same subject (Estudio para aprender)
      para que + subjunctive when different subjects (Estudio para que tú aprendas)

PHASE 2 - EXAMPLES:
5 sentences with purpose clauses showing different subject requirement.

PHASE 3 - QUIZ (15 questions):
Test para + infinitive vs para que + subjunctive. Include sin que, a fin de que.
Use Castilian Spanish with vosotros.
```

---

#### 8. `learning.spanish.grammar.subjunctive_time_clauses.v1`

**Activity:** Subjunctive in Time Clauses (Future Reference)

**Prompt:**
```
LESSON: Subjunctive with Time Conjunctions

PHASE 1 - TEACH:
Time conjunctions take subjunctive when referring to FUTURE (not yet happened):
- cuando (when) - future = subjunctive, past/habitual = indicative
- antes de que (before) - ALWAYS subjunctive
- después de que (after) - future = subjunctive
- hasta que (until) - future = subjunctive
- tan pronto como / en cuanto (as soon as) - future = subjunctive
- mientras (while) - future = subjunctive

Contrast: Cuando llegó, comimos (past = indicative)
         Cuando llegue, comeremos (future = subjunctive)

PHASE 2 - EXAMPLES:
5 pairs showing indicative (past) vs subjunctive (future) with time clauses.

PHASE 3 - QUIZ (15 questions):
Test the future vs past distinction. Heavy focus on cuando.
Use Castilian Spanish with vosotros.
```

---

#### 9. `learning.spanish.grammar.subjunctive_concession_condition.v1`

**Activity:** Subjunctive with Concession & Condition

**Prompt:**
```
LESSON: Subjunctive with Aunque, A menos que, Con tal de que

PHASE 1 - TEACH:
Concession (aunque):
- aunque + indicative = fact (Aunque llueve, salgo = Even though it's raining)
- aunque + subjunctive = hypothetical (Aunque llueva, saldré = Even if it rains)

Most conditional conjunctions take subjunctive (future/uncertain conditions):
- a menos que (unless)
- a no ser que (unless)
- con tal de que (provided that)
- a condición de que (on the condition that)
- en caso de que (in case)
- siempre que (as long as) - subjunctive for condition/uncertainty; indicative if stating a general fact

PHASE 2 - EXAMPLES:
5 sentences showing aunque contrast and conditional conjunctions.

PHASE 3 - QUIZ (15 questions):
Focus on aunque (indicative vs subjunctive) and conditional conjunctions.
Use Castilian Spanish with vosotros.
```

---

### Imperfect Subjunctive (3)

---

#### 10. `learning.spanish.grammar.subjunctive_imperfect_formation.v1`

**Activity:** Imperfect Subjunctive - Formation (-RA and -SE)

**Prompt:**
```
LESSON: Imperfect Subjunctive Formation

PHASE 1 - TEACH:
Form from 3rd person plural preterite (ellos form), drop -ron, add endings:
- -RA endings: -ra, -ras, -ra, -ramos (accent!), -rais, -ran
- -SE endings: -se, -ses, -se, -semos (accent!), -seis, -sen
Examples:
- hablar → hablaron → hablara/hablase
- comer → comieron → comiera/comiese
- vivir → vivieron → viviera/viviese
Both forms are interchangeable (-ra more common in speech)

PHASE 2 - EXAMPLES:
5 sentences using imperfect subjunctive with both -ra and -se forms.

PHASE 3 - QUIZ (15 questions):
Conjugation practice. Include regular and common irregular stems.
Use Castilian Spanish with vosotros.
```

---

#### 11. `learning.spanish.grammar.subjunctive_imperfect_irregulars.v1`

**Activity:** Imperfect Subjunctive - Irregular Stems

**Prompt:**
```
LESSON: Imperfect Subjunctive - Irregular Verbs

PHASE 1 - TEACH:
Irregular stems come from preterite (ellos) form:
- tener → tuvieron → tuviera/tuviese
- hacer → hicieron → hiciera/hiciese
- decir → dijeron → dijera/dijese
- poder → pudieron → pudiera/pudiese
- poner → pusieron → pusiera/pusiese
- saber → supieron → supiera/supiese
- querer → quisieron → quisiera/quisiese
- venir → vinieron → viniera/viniese
- estar → estuvieron → estuviera/estuviese
- ser/ir → fueron → fuera/fuese (same form!)

PHASE 2 - EXAMPLES:
5 sentences with irregular imperfect subjunctive verbs.

PHASE 3 - QUIZ (15 questions):
Focus on irregular stems. Include ser/ir (fuera) distinction by context.
Use Castilian Spanish with vosotros.
```

---

#### 12. `learning.spanish.grammar.subjunctive_imperfect_wishes.v1`

**Activity:** Imperfect Subjunctive - Wishes with Ojalá

**Prompt:**
```
LESSON: Ojalá + Imperfect Subjunctive

PHASE 1 - TEACH:
Ojalá changes meaning based on tense:
- Ojalá + present subjunctive = I hope (possible wish)
  "Ojalá venga" = I hope he comes (might happen)
- Ojalá + imperfect subjunctive = I wish / If only (unlikely/contrary to fact)
  "Ojalá viniera" = I wish he would come (but he probably won't)
  "Ojalá tuviera más dinero" = I wish I had more money (but I don't)

Also used in other wish expressions:
- Quién + imperfect subjunctive (Quién pudiera volar = If only I could fly)

PHASE 2 - EXAMPLES:
5 pairs contrasting ojalá + present vs ojalá + imperfect subjunctive.

PHASE 3 - QUIZ (15 questions):
Test ojalá usage. Include context clues for choosing present vs imperfect.
Use Castilian Spanish with vosotros.
```

---

### Subjunctive Review (3)

---

#### 13. `learning.spanish.grammar.subjunctive_present_vs_imperfect.v1`

**Activity:** Present vs Imperfect Subjunctive - When to Use Each

**Prompt:**
```
LESSON: Choosing Between Present and Imperfect Subjunctive

PHASE 1 - TEACH:
Sequence of tenses rule:
- Main verb PRESENT/FUTURE → Present subjunctive
  "Quiero que vengas" (I want you to come)
- Main verb PAST/CONDITIONAL → Imperfect subjunctive
  "Quería que vinieras" (I wanted you to come)
  "Querría que vinieras" (I would like you to come)

Exceptions:
- Past action still relevant now can use present subjunctive
- Ojalá follows its own rules (see previous lesson)

PHASE 2 - EXAMPLES:
5 pairs showing same sentence in present vs past contexts.

PHASE 3 - QUIZ (15 questions):
Given context, choose present or imperfect subjunctive.
Use Castilian Spanish with vosotros.
```

---

#### 14. `learning.spanish.grammar.subjunctive_vs_indicative_overview.v1`

**Activity:** Subjunctive vs Indicative - Key Decision Points

**Prompt:**
```
LESSON: When to Use Subjunctive vs Indicative

PHASE 1 - TEACH:
Quick decision framework:
SUBJUNCTIVE when expressing:
- Wishes, desires, preferences (querer que, preferir que)
- Emotions about others (me alegra que, siento que)
- Doubt, denial, disbelief (dudar que, no creer que)
- Impersonal judgments (es importante que, es necesario que)
- Purpose (para que, a fin de que)
- Future time clauses (cuando + future reference)
- Hypotheticals (aunque + hypothetical, si clauses)

INDICATIVE when stating:
- Facts (creo que, es verdad que, sé que)
- Past/habitual events (cuando + past)
- Certainty (es cierto que, es obvio que)

PHASE 2 - EXAMPLES:
5 contrasting pairs showing indicative vs subjunctive choice.

PHASE 3 - QUIZ (15 questions):
Mixed scenarios requiring indicative/subjunctive choice.
Use Castilian Spanish with vosotros.
```

---

#### 15. `learning.spanish.grammar.subjunctive_comprehensive_practice.v1`

**Activity:** Subjunctive - Comprehensive Practice

**Prompt:**
```
LESSON: Subjunctive Comprehensive Review

PHASE 1 - TEACH:
Quick recap of all subjunctive uses covered:
1. Formation (regular, irregular, spelling changes)
2. Triggers (WEIRDO: Wishes, Emotions, Impersonal, Recommendations, Doubt, Ojalá)
3. Conjunctions (para que, antes de que, cuando + future, aunque + hypothetical)
4. Present vs Imperfect (sequence of tenses)
5. Indicative contrast (facts vs non-facts)

PHASE 2 - EXAMPLES:
5 complex sentences mixing multiple subjunctive concepts.

PHASE 3 - QUIZ (15 questions):
Comprehensive mix of all subjunctive types. Include error correction.
Use Castilian Spanish with vosotros.
```

---

## 2. CONDITIONAL MOOD (27 cards)

### Conditional Formation (6)

---

#### 16. `learning.spanish.grammar.conditional_regular_formation.v1`

**Activity:** Conditional - Regular Verb Formation

**Prompt:**
```
LESSON: Conditional Mood - Regular Formation

PHASE 1 - TEACH:
The conditional is formed by adding endings to the INFINITIVE:
- Endings (same for -AR, -ER, -IR): -ía, -ías, -ía, -íamos, -íais, -ían
- hablar → hablaría, hablarías, hablaría, hablaríamos, hablaríais, hablarían
- comer → comería, comerías, comería, comeríamos, comeríais, comerían
- vivir → viviría, vivirías, viviría, viviríamos, viviríais, vivirían

Note: Same endings as imperfect of -ER/-IR verbs, but added to infinitive!

PHASE 2 - EXAMPLES:
5 sentences using regular conditional with translations.

PHASE 3 - QUIZ (15 questions):
Conjugation and sentence completion with regular verbs.
Use Castilian Spanish with vosotros.
```

---

#### 17. `learning.spanish.grammar.conditional_irregular_stems.v1`

**Activity:** Conditional - Irregular Stems (Part 1)

**Prompt:**
```
LESSON: Conditional - Irregular Stems (Group 1)

PHASE 1 - TEACH:
Some verbs have modified stems (shared with the future tense irregulars).
Memorize the stem (don’t over-generalize a single “rule”):
- poder → podr- → podría (I would be able to)
- querer → querr- → querría (I would want)
- saber → sabr- → sabría (I would know)
- haber → habr- → habría (there would be / I would have)
- caber → cabr- → cabría (I would fit)

These use the same endings: -ía, -ías, -ía, -íamos, -íais, -ían

PHASE 2 - EXAMPLES:
5 sentences using these irregular conditionals in context.

PHASE 3 - QUIZ (15 questions):
Focus on poder, querer, saber, haber. Mix conjugation and usage.
Use Castilian Spanish with vosotros.
```

---

#### 18. `learning.spanish.grammar.conditional_irregular_stems_2.v1`

**Activity:** Conditional - Irregular Stems (Part 2)

**Prompt:**
```
LESSON: Conditional - Irregular Stems (Group 2)

PHASE 1 - TEACH:
More irregular stems:
DROP VOWEL + INSERT D:
- tener → tendr- → tendría (I would have)
- poner → pondr- → pondría (I would put)
- venir → vendr- → vendría (I would come)
- salir → saldr- → saldría (I would leave)
- valer → valdr- → valdría (I would be worth)

SHORTENED:
- decir → dir- → diría (I would say)
- hacer → har- → haría (I would do/make)

PHASE 2 - EXAMPLES:
5 sentences using these irregular conditionals.

PHASE 3 - QUIZ (15 questions):
All irregular conditional stems mixed. Include both groups.
Use Castilian Spanish with vosotros.
```

---

#### 19. `learning.spanish.grammar.conditional_politeness.v1`

**Activity:** Conditional for Polite Requests

**Prompt:**
```
LESSON: Conditional for Politeness

PHASE 1 - TEACH:
Conditional softens requests (more polite than present):
- ¿Puedes ayudarme? → ¿Podrías ayudarme? (Could you help me?)
- Quiero un café → Querría un café (I would like a coffee)
- ¿Me pasas la sal? → ¿Me pasarías la sal? (Would you pass the salt?)

Common polite conditionals:
- podría (could)
- querría (would like) - often replaced by quisiera (imperfect subjunctive)
- debería (should)
- sería posible (would it be possible)
- le importaría (would you mind)

PHASE 2 - EXAMPLES:
5 polite requests using conditional with translations.

PHASE 3 - QUIZ (15 questions):
Transform direct requests into polite conditionals.
Use Castilian Spanish with vosotros.
```

---

#### 20. `learning.spanish.grammar.conditional_probability_past.v1`

**Activity:** Conditional for Past Probability

**Prompt:**
```
LESSON: Conditional for Past Conjecture

PHASE 1 - TEACH:
Conditional expresses probability about the PAST (like "must have been"):
- ¿Qué hora era? Serían las tres. (What time was it? It must have been 3.)
- ¿Quién llamó? Sería tu madre. (Who called? It was probably your mother.)
- Tendría unos 50 años. (He was probably about 50.)
- Costaría mucho. (It probably cost a lot.)

Compare with future for PRESENT probability:
- ¿Qué hora es? Serán las tres. (It's probably 3 now.)
- ¿Qué hora era? Serían las tres. (It was probably 3 then.)

PHASE 2 - EXAMPLES:
5 sentences using conditional for past probability.

PHASE 3 - QUIZ (15 questions):
Express past probability. Include future vs conditional contrast.
Use Castilian Spanish with vosotros.
```

---

#### 21. `learning.spanish.grammar.conditional_reported_speech.v1`

**Activity:** Conditional in Reported Speech

**Prompt:**
```
LESSON: Conditional in Indirect Speech

PHASE 1 - TEACH:
When reporting what someone said about the future, future becomes conditional:
- Direct: "Vendré mañana" (I will come tomorrow)
- Reported: Dijo que vendría al día siguiente (He said he would come the next day)

Pattern: SAID + WOULD = dijo que + conditional
- "Lo haré" → Dijo que lo haría
- "Saldremos a las 8" → Dijeron que saldrían a las 8
- "Te llamaré" → Prometió que me llamaría

Time expressions also shift:
- mañana → al día siguiente
- la semana que viene → la semana siguiente

PHASE 2 - EXAMPLES:
5 direct-to-indirect speech transformations.

PHASE 3 - QUIZ (15 questions):
Convert direct speech to reported speech using conditional.
Use Castilian Spanish with vosotros.
```

---

### Si Clauses - Real Conditions (4)

---

#### 22. `learning.spanish.grammar.si_clauses_real_present.v1`

**Activity:** Si Clauses - Real Conditions (Present/Future)

**Prompt:**
```
LESSON: Real Conditional - Si + Present → Present/Future

PHASE 1 - TEACH:
For conditions that are POSSIBLE or LIKELY:
Si + PRESENT INDICATIVE → PRESENT or FUTURE

Structure:
- Si llueve, me quedo en casa. (If it rains, I stay home.)
- Si llueve, me quedaré en casa. (If it rains, I will stay home.)
- Si tienes tiempo, llámame. (If you have time, call me.)
- Si no estudias, no aprobarás. (If you don't study, you won't pass.)

NEVER use future or conditional after "si" in real conditions!
- WRONG: Si lloverá...
- RIGHT: Si llueve...

PHASE 2 - EXAMPLES:
5 real conditional sentences with translations.

PHASE 3 - QUIZ (15 questions):
Complete si clauses. Avoid the "si + future" error.
Use Castilian Spanish with vosotros.
```

---

#### 23. `learning.spanish.grammar.si_clauses_real_past.v1`

**Activity:** Si Clauses - Real Conditions (Past)

**Prompt:**
```
LESSON: Real Conditional - Si + Past → Past

PHASE 1 - TEACH:
For describing past conditions that happened:
Si + PRETERITE/IMPERFECT → PRETERITE/IMPERFECT

Examples:
- Si llegaba tarde, mi madre se enfadaba. (If I arrived late, my mother got angry - habitual)
- Si no entendía, preguntaba. (If I didn't understand, I asked - habitual)
- Si llovió ayer, las plantas ya tienen agua. (If it rained yesterday, the plants have water)

These are REAL past conditions - not hypothetical!

PHASE 2 - EXAMPLES:
5 past real conditional sentences.

PHASE 3 - QUIZ (15 questions):
Complete past real conditions. Mix preterite and imperfect appropriately.
Use Castilian Spanish with vosotros.
```

---

#### 24. `learning.spanish.grammar.si_clauses_real_habits.v1`

**Activity:** Si Clauses - Past Habits and General Truths

**Prompt:**
```
LESSON: Si + Imperfect for Past Habits

PHASE 1 - TEACH:
Si + imperfect describes past habitual conditions:
- Si hacía buen tiempo, íbamos a la playa. (If the weather was nice, we'd go to the beach)
- Si tenía dinero, lo gastaba. (If I had money, I spent it)
- Si mi abuela cocinaba, siempre comíamos bien. (If grandma cooked, we always ate well)

This is NOT the hypothetical "would" - it's the habitual "used to":
- Hypothetical: Si tuviera dinero, lo gastaría. (If I had money, I would spend it - but I don't)
- Habitual: Si tenía dinero, lo gastaba. (Whenever I had money, I spent it - in the past)

PHASE 2 - EXAMPLES:
5 sentences showing past habitual si clauses.

PHASE 3 - QUIZ (15 questions):
Distinguish habitual past (imperfect) from hypothetical (subjunctive + conditional).
Use Castilian Spanish with vosotros.
```

---

#### 25. `learning.spanish.grammar.si_clauses_real_mixed.v1`

**Activity:** Real Si Clauses - Mixed Practice

**Prompt:**
```
LESSON: Real Conditions - Comprehensive Practice

PHASE 1 - TEACH:
Quick recap of real (open) conditions:
1. Present/Future: Si + present → present/future/imperative
   "Si vienes, te lo cuento"
2. Past Fact: Si + preterite → preterite
   "Si lo viste, sabes la verdad"
3. Past Habit: Si + imperfect → imperfect
   "Si llovía, nos quedábamos dentro"

Key: These are all INDICATIVE - no subjunctive!
The condition is presented as possible/real, not hypothetical.

PHASE 2 - EXAMPLES:
5 mixed real condition sentences covering all types.

PHASE 3 - QUIZ (15 questions):
Mixed real conditions. Identify tense and complete sentences.
Use Castilian Spanish with vosotros.
```

---

### Si Clauses - Unreal Conditions (6)

---

#### 26. `learning.spanish.grammar.si_clauses_unreal_present.v1`

**Activity:** Si Clauses - Unreal Present (Hypothetical)

**Prompt:**
```
LESSON: Hypothetical Conditional - Si + Imperfect Subjunctive → Conditional

PHASE 1 - TEACH:
For conditions CONTRARY TO PRESENT REALITY:
Si + IMPERFECT SUBJUNCTIVE → CONDITIONAL

- Si tuviera dinero, viajaría. (If I had money, I would travel - but I don't)
- Si fuera tú, no lo haría. (If I were you, I wouldn't do it - but I'm not)
- Si hablara español, entendería. (If he spoke Spanish, he would understand - but he doesn't)

The imperfect subjunctive (-ra/-se form) + conditional (-ía form)

PHASE 2 - EXAMPLES:
5 hypothetical present sentences with translations.

PHASE 3 - QUIZ (15 questions):
Complete hypothetical conditionals. Transform real to unreal.
Use Castilian Spanish with vosotros.
```

---

#### 27. `learning.spanish.grammar.si_clauses_unreal_past.v1`

**Activity:** Si Clauses - Unreal Past (Third Conditional)

**Prompt:**
```
LESSON: Past Hypothetical - Si + Pluperfect Subjunctive → Conditional Perfect

PHASE 1 - TEACH:
For conditions CONTRARY TO PAST REALITY:
Si + PLUPERFECT SUBJUNCTIVE → CONDITIONAL PERFECT

- Si hubiera estudiado, habría aprobado. (If I had studied, I would have passed - but I didn't)
- Si hubieras venido, te habrías divertido. (If you had come, you would have had fun)
- Si lo hubiera sabido, no habría ido. (If I had known, I wouldn't have gone)

Formation:
- Si hubiera/hubiese + participle → habría + participle

PHASE 2 - EXAMPLES:
5 past hypothetical sentences expressing regret or alternative outcomes.

PHASE 3 - QUIZ (15 questions):
Complete past hypotheticals. Express what would have happened.
Use Castilian Spanish with vosotros.
```

---

#### 28. `learning.spanish.grammar.si_clauses_unreal_mixed.v1`

**Activity:** Si Clauses - Mixed Unreal Conditions

**Prompt:**
```
LESSON: Mixed Hypothetical Conditions

PHASE 1 - TEACH:
Sometimes we mix time frames (past condition, present result or vice versa):

Past condition → Present result:
- Si hubiera estudiado medicina, ahora sería médico.
  (If I had studied medicine, I would now be a doctor)

Present condition → Past result:
- Si no fuera tan tímido, le habría hablado.
  (If I weren't so shy, I would have spoken to her)

Both are valid when the logic supports mixed time frames.

PHASE 2 - EXAMPLES:
5 mixed-timeframe hypothetical sentences.

PHASE 3 - QUIZ (15 questions):
Identify and complete mixed hypotheticals. Determine correct tense combinations.
Use Castilian Spanish with vosotros.
```

---

#### 29. `learning.spanish.grammar.si_clauses_como_si.v1`

**Activity:** Como Si + Subjunctive (As If)

**Prompt:**
```
LESSON: Como Si - As If / As Though

PHASE 1 - TEACH:
"Como si" (as if) ALWAYS takes subjunctive:
- Como si + imperfect subjunctive (for present comparison)
  "Habla como si supiera todo" (He talks as if he knew everything)
- Como si + pluperfect subjunctive (for past comparison)
  "Me miró como si hubiera visto un fantasma" (She looked at me as if she had seen a ghost)

NEVER use indicative after como si!
Common patterns:
- Actúa como si... (acts as if)
- Parece como si... (seems as if)
- Me trata como si... (treats me as if)

PHASE 2 - EXAMPLES:
5 sentences with como si showing imperfect and pluperfect subjunctive.

PHASE 3 - QUIZ (15 questions):
Complete como si sentences. Choose correct subjunctive tense.
Use Castilian Spanish with vosotros.
```

---

#### 30. `learning.spanish.grammar.si_clauses_de_haber.v1`

**Activity:** De + Infinitive (Alternative to Si Clauses)

**Prompt:**
```
LESSON: De + Infinitive as Conditional

PHASE 1 - TEACH:
"De + infinitive" can replace "si + subjunctive" in formal/written Spanish:

- De haberlo sabido, no habría venido.
  = Si lo hubiera sabido, no habría venido.
  (Had I known, I wouldn't have come)

- De ser posible, me gustaría ir.
  = Si fuera posible, me gustaría ir.
  (Were it possible, I would like to go)

- De tener tiempo, te ayudaría.
  = Si tuviera tiempo, te ayudaría.
  (If I had time, I would help you)

This is more literary/formal but common in writing.

PHASE 2 - EXAMPLES:
5 pairs showing si clause and de + infinitive equivalents.

PHASE 3 - QUIZ (15 questions):
Transform between si clauses and de + infinitive constructions.
Use Castilian Spanish with vosotros.
```

---

#### 31. `learning.spanish.grammar.si_clauses_comprehensive.v1`

**Activity:** Si Clauses - All Types Together

**Prompt:**
```
LESSON: Si Clauses Comprehensive Review

PHASE 1 - TEACH:
Summary of all si clause types:

1. REAL PRESENT: Si + present → present/future
   "Si llueve, no voy"

2. REAL PAST: Si + preterite/imperfect → preterite/imperfect
   "Si llovía, no íbamos"

3. UNREAL PRESENT: Si + imperfect subjunctive → conditional
   "Si lloviera, no iría"

4. UNREAL PAST: Si + pluperfect subjunctive → conditional perfect
   "Si hubiera llovido, no habría ido"

5. COMO SI: always + imperfect/pluperfect subjunctive
   "Como si lloviera"

PHASE 2 - EXAMPLES:
5 sentences covering different si clause types.

PHASE 3 - QUIZ (15 questions):
Identify type and complete various si clauses. Include error correction.
Use Castilian Spanish with vosotros.
```

---

### Conditional Perfect (4)

---

#### 32. `learning.spanish.grammar.conditional_perfect_formation.v1`

**Activity:** Conditional Perfect - Formation

**Prompt:**
```
LESSON: Conditional Perfect (Habría + Participle)

PHASE 1 - TEACH:
Formation: HABRÍA + PAST PARTICIPLE
- habría, habrías, habría, habríamos, habríais, habrían + participle

Examples:
- habría hablado (I would have spoken)
- habrías comido (you would have eaten)
- habríamos vivido (we would have lived)

Irregular participles remain irregular:
- habría hecho (would have done)
- habría dicho (would have said)
- habría visto (would have seen)

PHASE 2 - EXAMPLES:
5 sentences using conditional perfect with translations.

PHASE 3 - QUIZ (15 questions):
Form conditional perfect. Include irregular participles.
Use Castilian Spanish with vosotros.
```

---

#### 33. `learning.spanish.grammar.conditional_perfect_regrets.v1`

**Activity:** Conditional Perfect - Expressing Regrets

**Prompt:**
```
LESSON: Expressing Regrets with Conditional Perfect

PHASE 1 - TEACH:
Use conditional perfect to express what you would have done (but didn't):

- Habría estudiado más. (I would have studied more - but I didn't)
- No habría dicho eso. (I wouldn't have said that - but I did)
- Habríamos ido a la fiesta. (We would have gone to the party - but we didn't)

Often with "pero" (but):
- Habría llamado, pero no tenía tu número.
  (I would have called, but I didn't have your number)

Or with past hypotheticals (si clauses):
- Si hubiera tenido tu número, te habría llamado.

PHASE 2 - EXAMPLES:
5 regret expressions using conditional perfect.

PHASE 3 - QUIZ (15 questions):
Express regrets and missed opportunities using conditional perfect.
Use Castilian Spanish with vosotros.
```

---

#### 34. `learning.spanish.grammar.conditional_perfect_hypotheticals.v1`

**Activity:** Conditional Perfect - Hypothetical Past Results

**Prompt:**
```
LESSON: Conditional Perfect in Hypothetical Past

PHASE 1 - TEACH:
The conditional perfect is the RESULT clause in past hypotheticals:

Si + pluperfect subjunctive → CONDITIONAL PERFECT
- Si hubieras venido, te HABRÍAS DIVERTIDO.
- Si hubiera llovido, la fiesta se HABRÍA CANCELADO.
- Si no hubiéramos salido temprano, HABRÍAMOS LLEGADO tarde.

Without explicit si clause (implied condition):
- Yo no habría hecho eso. (I wouldn't have done that - implied: in your situation)
- ¿Tú habrías aceptado? (Would you have accepted? - implied: in that situation)

PHASE 2 - EXAMPLES:
5 past hypotheticals with conditional perfect results.

PHASE 3 - QUIZ (15 questions):
Complete past hypothetical sentences. Focus on result clause.
Use Castilian Spanish with vosotros.
```

---

#### 35. `learning.spanish.grammar.conditional_perfect_probability.v1`

**Activity:** Conditional Perfect for Past Probability

**Prompt:**
```
LESSON: Conditional Perfect for Conjecture About Earlier Past

PHASE 1 - TEACH:
Conditional perfect expresses probability about something that happened BEFORE another past event:

- Cuando llegué, ya habrían salido.
  (When I arrived, they had probably already left)
- ¿Por qué no contestó? Habría perdido el teléfono.
  (Why didn't he answer? He had probably lost his phone)
- Habrían terminado antes de las 5.
  (They had probably finished before 5)

Compare:
- Conditional: Serían las 3. (It was probably 3 - at that moment)
- Conditional perfect: Ya habrían llegado. (They had probably already arrived - before then)

PHASE 2 - EXAMPLES:
5 sentences using conditional perfect for past probability.

PHASE 3 - QUIZ (15 questions):
Express probability about past events using conditional perfect.
Use Castilian Spanish with vosotros.
```

---

### Conditional Expressions (4)

---

#### 36. `learning.spanish.grammar.conditional_wishes_me_gustaria.v1`

**Activity:** Me Gustaría Que + Subjunctive

**Prompt:**
```
LESSON: Expressing Wishes - Me Gustaría Que

PHASE 1 - TEACH:
"Me gustaría que" (I would like for...) takes IMPERFECT SUBJUNCTIVE:

- Me gustaría que vinieras. (I would like you to come)
- Nos gustaría que estudiaras más. (We would like you to study more)
- ¿Te gustaría que fuéramos al cine? (Would you like us to go to the movies?)

Same subject? Use infinitive:
- Me gustaría ir. (I would like to go) - NOT "Me gustaría que yo fuera"

Other similar patterns:
- Preferiría que... (I would prefer that...)
- Querría que... (I would want that...)

PHASE 2 - EXAMPLES:
5 wishes using me gustaría que + imperfect subjunctive.

PHASE 3 - QUIZ (15 questions):
Express wishes. Choose between infinitive and que + subjunctive.
Use Castilian Spanish with vosotros.
```

---

#### 37. `learning.spanish.grammar.conditional_yo_que_tu.v1`

**Activity:** Yo Que Tú / En Tu Lugar (If I Were You)

**Prompt:**
```
LESSON: Giving Advice - "If I Were You"

PHASE 1 - TEACH:
Expressions for "If I were you":
- Yo que tú + conditional
- Yo en tu lugar + conditional
- Si yo fuera tú + conditional

Examples:
- Yo que tú, no iría. (If I were you, I wouldn't go)
- Yo en tu lugar, hablaría con él. (In your place, I would talk to him)
- Si yo fuera tú, lo pensaría mejor. (If I were you, I would think it over)

Common conditionals for advice:
- iría/no iría (would go/wouldn't go)
- hablaría (would talk)
- esperaría (would wait)
- lo pensaría (would think about it)

PHASE 2 - EXAMPLES:
5 pieces of advice using these expressions.

PHASE 3 - QUIZ (15 questions):
Give advice using yo que tú, en tu lugar, si yo fuera tú.
Use Castilian Spanish with vosotros.
```

---

#### 38. `learning.spanish.grammar.conditional_deberia_haber.v1`

**Activity:** Debería/Tendría Que Haber + Participle

**Prompt:**
```
LESSON: Should Have / Ought to Have

PHASE 1 - TEACH:
Expressing what SHOULD HAVE happened:
- Debería haber + participle
- Tendría que haber + participle

Examples:
- Debería haber estudiado más. (I should have studied more)
- Tendrías que haber llamado antes. (You should have called earlier)
- No deberíamos haber venido. (We shouldn't have come)

Difference from conditional perfect:
- Habría estudiado = I would have studied (neutral)
- Debería haber estudiado = I should have studied (obligation/regret)

PHASE 2 - EXAMPLES:
5 sentences expressing what should have happened.

PHASE 3 - QUIZ (15 questions):
Express obligation and regret with debería/tendría que haber.
Use Castilian Spanish with vosotros.
```

---

#### 39. `learning.spanish.grammar.conditional_ojala_past.v1`

**Activity:** Ojalá + Pluperfect Subjunctive (Past Wishes)

**Prompt:**
```
LESSON: Ojalá for Impossible Past Wishes

PHASE 1 - TEACH:
Ojalá + pluperfect subjunctive expresses regret about the past (wish it had been different):

- Ojalá hubiera estudiado más. (I wish I had studied more)
- Ojalá no hubieras dicho eso. (I wish you hadn't said that)
- Ojalá hubiéramos llegado a tiempo. (I wish we had arrived on time)

Compare Ojalá tenses:
- Ojalá venga (present subj) = I hope he comes (possible)
- Ojalá viniera (imperfect subj) = I wish he would come (unlikely present)
- Ojalá hubiera venido (pluperfect subj) = I wish he had come (impossible past)

PHASE 2 - EXAMPLES:
5 past wishes using ojalá + pluperfect subjunctive.

PHASE 3 - QUIZ (15 questions):
Express wishes about the past. Choose correct ojalá construction.
Use Castilian Spanish with vosotros.
```

---

### Conditional Review (3)

---

#### 40. `learning.spanish.grammar.conditional_vs_imperfect.v1`

**Activity:** Conditional vs Imperfect - "Would"

**Prompt:**
```
LESSON: When "Would" is NOT Conditional

PHASE 1 - TEACH:
English "would" has multiple meanings - not always conditional in Spanish:

1. HYPOTHETICAL "would" = CONDITIONAL
   "I would go if I could" = Iría si pudiera

2. HABITUAL PAST "would" = IMPERFECT
   "When I was young, I would play outside" = De pequeño, jugaba fuera
   (NOT jugaría!)

3. POLITE REQUEST "would" = CONDITIONAL
   "Would you help me?" = ¿Me ayudarías?

4. REPORTED FUTURE "would" = CONDITIONAL
   "He said he would come" = Dijo que vendría

Key: "Used to" or habitual = imperfect. Hypothetical = conditional.

PHASE 2 - EXAMPLES:
5 sentences showing when to use imperfect vs conditional for "would."

PHASE 3 - QUIZ (15 questions):
Translate "would" sentences correctly. Distinguish habitual from hypothetical.
Use Castilian Spanish with vosotros.
```

---

#### 41. `learning.spanish.grammar.conditional_future_in_past.v1`

**Activity:** Conditional as Future-in-the-Past

**Prompt:**
```
LESSON: Conditional for Future from Past Perspective

PHASE 1 - TEACH:
The conditional expresses what WAS future from a past viewpoint:

Direct speech (future): "Vendré mañana" (I will come tomorrow)
Narrative (conditional): Dijo que vendría al día siguiente. (He said he would come...)

More examples:
- Sabía que llegarían tarde. (I knew they would arrive late)
- Pensaba que sería fácil. (I thought it would be easy)
- No imaginaba que costaría tanto. (I didn't imagine it would cost so much)

This is NOT hypothetical - it's perspective shift from past narration.

PHASE 2 - EXAMPLES:
5 sentences using conditional as future-in-the-past.

PHASE 3 - QUIZ (15 questions):
Shift perspective from direct to reported speech using conditional.
Use Castilian Spanish with vosotros.
```

---

#### 42. `learning.spanish.grammar.conditional_comprehensive.v1`

**Activity:** Conditional Mood - Comprehensive Review

**Prompt:**
```
LESSON: Conditional Comprehensive Review

PHASE 1 - TEACH:
All uses of the conditional:
1. HYPOTHETICAL: Si tuviera dinero, viajaría.
2. POLITE REQUESTS: ¿Podrías ayudarme?
3. PAST PROBABILITY: Serían las tres.
4. FUTURE-IN-THE-PAST: Dijo que vendría.
5. ADVICE: Yo que tú, no iría.
6. WISHES: Me gustaría que vinieras.

Conditional Perfect uses:
1. PAST HYPOTHETICAL RESULT: Habría ido si hubiera podido.
2. REGRET: Debería haber estudiado más.
3. PROBABILITY (earlier past): Ya habrían llegado.

PHASE 2 - EXAMPLES:
5 sentences covering different conditional uses.

PHASE 3 - QUIZ (15 questions):
Mixed conditional scenarios. Identify use and complete sentences.
Use Castilian Spanish with vosotros.
```

---

## 3. PERFECT TENSES (15 cards)

### Present Perfect (5)

---

#### 43. `learning.spanish.grammar.perfect_present_formation.v1`

**Activity:** Present Perfect - Formation with Haber

**Prompt:**
```
LESSON: Present Perfect Formation

PHASE 1 - TEACH:
Formation: PRESENT of HABER + PAST PARTICIPLE
- he, has, ha, hemos, habéis, han + participle

Regular participles:
- -AR → -ado (hablar → hablado)
- -ER/-IR → -ido (comer → comido, vivir → vivido)

Examples:
- He hablado con él. (I have spoken with him)
- ¿Has comido? (Have you eaten?)
- Hemos vivido aquí 10 años. (We have lived here 10 years)

Note: Participle NEVER changes for gender/number in compound tenses!
- Ella ha llegado (NOT llegada)

PHASE 2 - EXAMPLES:
5 present perfect sentences with translations.

PHASE 3 - QUIZ (15 questions):
Form present perfect. Include all persons.
Use Castilian Spanish with vosotros.
```

---

#### 44. `learning.spanish.grammar.perfect_present_irregulars.v1`

**Activity:** Present Perfect - Irregular Participles

**Prompt:**
```
LESSON: Irregular Past Participles

PHASE 1 - TEACH:
Common irregular participles:
- abrir → abierto (opened)
- cubrir → cubierto (covered)
- decir → dicho (said)
- escribir → escrito (written)
- hacer → hecho (done/made)
- morir → muerto (died)
- poner → puesto (put)
- resolver → resuelto (resolved)
- romper → roto (broken)
- ver → visto (seen)
- volver → vuelto (returned)

Compounds follow the same pattern:
- describir → descrito, devolver → devuelto

PHASE 2 - EXAMPLES:
5 sentences with irregular participles.

PHASE 3 - QUIZ (15 questions):
Use irregular participles in present perfect.
Use Castilian Spanish with vosotros.
```

---

#### 45. `learning.spanish.grammar.perfect_present_vs_preterite.v1`

**Activity:** Present Perfect vs Preterite

**Prompt:**
```
LESSON: Present Perfect vs Preterite Usage

PHASE 1 - TEACH:
In Spain (differs from Latin America):
PRESENT PERFECT - recent past, still relevant:
- Hoy he comido paella. (Today I have eaten paella)
- Esta semana ha llovido mucho. (This week it has rained a lot)
- ¿Has visto a Juan? (Have you seen Juan? - recently)

PRETERITE - completed past, specific time:
- Ayer comí paella. (Yesterday I ate paella)
- La semana pasada llovió mucho. (Last week it rained a lot)
- Vi a Juan ayer. (I saw Juan yesterday)

Key markers:
- Present perfect: hoy, esta semana, este mes, ya, todavía, alguna vez, nunca
- Preterite: ayer, la semana pasada, en 2020, hace dos años

PHASE 2 - EXAMPLES:
5 pairs contrasting present perfect and preterite.

PHASE 3 - QUIZ (15 questions):
Choose between present perfect and preterite based on context.
Use Castilian Spanish with vosotros.
```

---

#### 46. `learning.spanish.grammar.perfect_present_markers.v1`

**Activity:** Present Perfect Time Markers

**Prompt:**
```
LESSON: Time Expressions with Present Perfect

PHASE 1 - TEACH:
Key time markers for present perfect:
- ya (already): Ya he terminado. (I've already finished)
- todavía no / aún no (not yet): Todavía no he comido. (I haven't eaten yet)
- alguna vez (ever): ¿Has estado alguna vez en España? (Have you ever been to Spain?)
- nunca (never): Nunca he visto esa película. (I've never seen that movie)
- siempre (always): Siempre he querido viajar. (I've always wanted to travel)
- últimamente / recientemente (lately/recently): Últimamente he trabajado mucho.

Word order:
- Ya/todavía usually before haber: Ya he comido / Todavía no he comido
- Nunca/siempre usually before haber: Nunca he ido

PHASE 2 - EXAMPLES:
5 sentences demonstrating different time markers.

PHASE 3 - QUIZ (15 questions):
Use time markers with present perfect. Correct word order.
Use Castilian Spanish with vosotros.
```

---

#### 47. `learning.spanish.grammar.perfect_present_experience.v1`

**Activity:** Present Perfect for Life Experiences

**Prompt:**
```
LESSON: Expressing Life Experiences

PHASE 1 - TEACH:
Use present perfect for experiences (no specific time):
- ¿Has viajado a México? (Have you traveled to Mexico?)
- He probado sushi. (I've tried sushi)
- Nunca he visto la nieve. (I've never seen snow)
- Hemos estado en París tres veces. (We've been to Paris three times)

Responses:
- Sí, he estado allí. (Yes, I've been there)
- No, nunca he ido. (No, I've never been)
- Sí, una vez / dos veces / muchas veces (Yes, once / twice / many times)

Follow-up often uses preterite for specific time:
- ¿Has ido a Japón? Sí, fui en 2019.

PHASE 2 - EXAMPLES:
5 experience questions and answers.

PHASE 3 - QUIZ (15 questions):
Ask and answer about life experiences using present perfect.
Use Castilian Spanish with vosotros.
```

---

### Pluperfect (5)

---

#### 48. `learning.spanish.grammar.perfect_pluperfect_formation.v1`

**Activity:** Pluperfect - Formation (Había + Participle)

**Prompt:**
```
LESSON: Pluperfect (Past Perfect) Formation

PHASE 1 - TEACH:
Formation: IMPERFECT of HABER + PAST PARTICIPLE
- había, habías, había, habíamos, habíais, habían + participle

Examples:
- Ya había comido cuando llegaste. (I had already eaten when you arrived)
- Nunca habíamos visto algo así. (We had never seen anything like that)
- ¿Habías estado allí antes? (Had you been there before?)

Uses: Action completed BEFORE another past action
- Cuando llegué, ya se habían ido. (When I arrived, they had already left)
- No sabía que habías llamado. (I didn't know you had called)

PHASE 2 - EXAMPLES:
5 pluperfect sentences showing sequence of past events.

PHASE 3 - QUIZ (15 questions):
Form pluperfect. Establish correct past sequences.
Use Castilian Spanish with vosotros.
```

---

#### 49. `learning.spanish.grammar.perfect_pluperfect_sequence.v1`

**Activity:** Pluperfect - Sequencing Past Events

**Prompt:**
```
LESSON: Pluperfect for Sequencing

PHASE 1 - TEACH:
Use pluperfect to show what happened FIRST in a past narrative:

Pattern: [Earlier event - pluperfect] + [Later event - preterite/imperfect]

- Cuando llegué, la película ya había empezado.
  (When I arrived, the movie had already started)
- No fui porque ya había visto la película.
  (I didn't go because I had already seen the movie)
- Estaba cansado porque no había dormido bien.
  (I was tired because I hadn't slept well)

Key words: ya (already), todavía no (not yet), antes (before), nunca (never)

PHASE 2 - EXAMPLES:
5 sentences showing clear time sequencing.

PHASE 3 - QUIZ (15 questions):
Create past narratives with correct pluperfect usage.
Use Castilian Spanish with vosotros.
```

---

#### 50. `learning.spanish.grammar.perfect_pluperfect_reported.v1`

**Activity:** Pluperfect in Reported Speech

**Prompt:**
```
LESSON: Pluperfect in Indirect Speech

PHASE 1 - TEACH:
In reported speech, present perfect becomes pluperfect:

Direct: "He terminado" (I have finished)
Reported: Dijo que había terminado. (He said he had finished)

More examples:
- "Ya he comido" → Dijo que ya había comido.
- "Nunca he estado allí" → Me contó que nunca había estado allí.
- "¿Has visto mi libro?" → Me preguntó si había visto su libro.

This is part of the "backshift" in reported speech:
- Present → Imperfect
- Present Perfect → Pluperfect
- Future → Conditional

PHASE 2 - EXAMPLES:
5 direct-to-indirect transformations using pluperfect.

PHASE 3 - QUIZ (15 questions):
Convert direct speech to reported speech with pluperfect.
Use Castilian Spanish with vosotros.
```

---

#### 51. `learning.spanish.grammar.perfect_pluperfect_wishes.v1`

**Activity:** Pluperfect Subjunctive for Past Wishes

**Prompt:**
```
LESSON: Pluperfect Subjunctive - Past Wishes & Regrets

PHASE 1 - TEACH:
Formation: hubiera/hubiese + participle

Use for wishes about the UNCHANGEABLE past:
- Ojalá hubiera estudiado más. (I wish I had studied more)
- Si hubiera sabido... (If I had known...)
- Me habría gustado que hubieras venido. (I would have liked you to come)

Also after "como si" for past comparison:
- Me miró como si hubiera hecho algo malo.
  (He looked at me as if I had done something wrong)

PHASE 2 - EXAMPLES:
5 sentences using pluperfect subjunctive for past wishes/regrets.

PHASE 3 - QUIZ (15 questions):
Express past wishes and regrets with pluperfect subjunctive.
Use Castilian Spanish with vosotros.
```

---

#### 52. `learning.spanish.grammar.perfect_pluperfect_si_clauses.v1`

**Activity:** Pluperfect Subjunctive in Si Clauses

**Prompt:**
```
LESSON: Third Conditional - Si + Pluperfect Subjunctive

PHASE 1 - TEACH:
For unreal past conditions:
Si + HUBIERA/HUBIESE + participle → HABRÍA + participle

- Si hubiera tenido tiempo, habría ido.
  (If I had had time, I would have gone)
- Si hubieras estudiado, habrías aprobado.
  (If you had studied, you would have passed)
- Si no hubiera llovido, habríamos ido a la playa.
  (If it hadn't rained, we would have gone to the beach)

Both -ra and -se forms work: hubiera/hubiese

PHASE 2 - EXAMPLES:
5 third conditional sentences about the past.

PHASE 3 - QUIZ (15 questions):
Form third conditionals. Express what would have happened.
Use Castilian Spanish with vosotros.
```

---

### Future & Conditional Perfect (5)

---

#### 53. `learning.spanish.grammar.perfect_future_formation.v1`

**Activity:** Future Perfect - Formation (Habrá + Participle)

**Prompt:**
```
LESSON: Future Perfect Formation

PHASE 1 - TEACH:
Formation: FUTURE of HABER + PAST PARTICIPLE
- habré, habrás, habrá, habremos, habréis, habrán + participle

Examples:
- Para las 6, habré terminado. (By 6, I will have finished)
- Cuando llegues, ya habremos comido. (When you arrive, we will have eaten)
- ¿Habrás acabado antes del lunes? (Will you have finished before Monday?)

Uses:
1. Action completed before a future point
2. Probability about the past (see next lesson)

PHASE 2 - EXAMPLES:
5 sentences using future perfect for completed future actions.

PHASE 3 - QUIZ (15 questions):
Form future perfect. Express what will have happened by a certain time.
Use Castilian Spanish with vosotros.
```

---

#### 54. `learning.spanish.grammar.perfect_future_probability.v1`

**Activity:** Future Perfect for Past Probability

**Prompt:**
```
LESSON: Future Perfect for Probability

PHASE 1 - TEACH:
Future perfect can express PROBABILITY about the past ("must have"):

- ¿Dónde está Juan? Habrá salido ya.
  (Where is Juan? He must have left already)
- No contesta. Se habrá dormido.
  (She's not answering. She must have fallen asleep)
- Habrán perdido el tren.
  (They must have missed the train)

Compare probability tenses:
- Será médico. (He's probably a doctor - present probability)
- Habrá sido difícil. (It must have been difficult - past probability)

PHASE 2 - EXAMPLES:
5 sentences using future perfect for probability/conjecture.

PHASE 3 - QUIZ (15 questions):
Express probability about past events using future perfect.
Use Castilian Spanish with vosotros.
```

---

#### 55. `learning.spanish.grammar.perfect_conditional_formation.v1`

**Activity:** Conditional Perfect - Formation Review

**Prompt:**
```
LESSON: Conditional Perfect (Habría + Participle) Review

PHASE 1 - TEACH:
Formation: CONDITIONAL of HABER + PAST PARTICIPLE
- habría, habrías, habría, habríamos, habríais, habrían + participle

Three main uses:
1. HYPOTHETICAL RESULT: Si hubiera sabido, habría venido.
2. PROBABILITY (past of past): Ya habrían llegado cuando llamé.
3. FUTURE-IN-THE-PAST COMPLETED: Dijo que habría terminado para el lunes.

Examples:
- Habría ido, pero estaba enfermo. (I would have gone, but I was sick)
- ¿Habrías aceptado? (Would you have accepted?)
- No habríamos imaginado eso. (We wouldn't have imagined that)

PHASE 2 - EXAMPLES:
5 sentences covering different conditional perfect uses.

PHASE 3 - QUIZ (15 questions):
Use conditional perfect in various contexts.
Use Castilian Spanish with vosotros.
```

---

#### 56. `learning.spanish.grammar.perfect_conditional_hypothetical.v1`

**Activity:** Conditional Perfect - Hypothetical Past

**Prompt:**
```
LESSON: Conditional Perfect in Hypotheticals

PHASE 1 - TEACH:
Conditional perfect as result of past hypothetical:

Full structure:
Si + pluperfect subjunctive → conditional perfect
- Si hubiera tenido dinero, habría viajado.
- Si no hubieras hablado, no habríamos sabido.

Without "si" (implied condition):
- Yo no habría hecho eso. (I wouldn't have done that)
- ¿Tú habrías ido? (Would you have gone?)
- Habríamos preferido quedarnos. (We would have preferred to stay)

Alternative with pluperfect subjunctive as result (literary):
- Si hubiera tenido dinero, hubiera viajado. (Same meaning, less common)

PHASE 2 - EXAMPLES:
5 past hypotheticals with conditional perfect results.

PHASE 3 - QUIZ (15 questions):
Form and complete past hypothetical scenarios.
Use Castilian Spanish with vosotros.
```

---

#### 57. `learning.spanish.grammar.perfect_tenses_review.v1`

**Activity:** All Perfect Tenses - Comprehensive Review

**Prompt:**
```
LESSON: Perfect Tenses Comprehensive Review

PHASE 1 - TEACH:
Summary of all perfect tenses:

1. PRESENT PERFECT (he + participle): Recent past, life experience
   "He viajado a España"

2. PLUPERFECT (había + participle): Before another past event
   "Cuando llegué, ya había salido"

3. FUTURE PERFECT (habré + participle): Before a future point / past probability
   "Para mañana, habré terminado" / "Habrá salido ya"

4. CONDITIONAL PERFECT (habría + participle): Hypothetical past result
   "Si hubiera sabido, habría venido"

5. PLUPERFECT SUBJUNCTIVE (hubiera + participle): Si clauses, wishes
   "Si hubiera tenido tiempo..." / "Ojalá hubiera ido"

PHASE 2 - EXAMPLES:
5 sentences covering different perfect tenses.

PHASE 3 - QUIZ (15 questions):
Mixed perfect tense practice. Identify and form correctly.
Use Castilian Spanish with vosotros.
```

---

## 4. IMPERATIVE / COMMANDS (12 cards)

### Affirmative Commands (4)

---

#### 58. `learning.spanish.grammar.imperative_tu_affirmative.v1`

**Activity:** Affirmative Tú Commands

**Prompt:**
```
LESSON: Affirmative Tú Commands

PHASE 1 - TEACH:
Regular affirmative tú commands = él/ella form of present indicative:
- hablar → ¡Habla! (Speak!)
- comer → ¡Come! (Eat!)
- escribir → ¡Escribe! (Write!)

More examples:
- Lee el libro. (Read the book)
- Abre la ventana. (Open the window)
- Espera un momento. (Wait a moment)

8 irregular tú commands (memorize these!):
- decir → di, hacer → haz, ir → ve, poner → pon
- salir → sal, ser → sé, tener → ten, venir → ven

PHASE 2 - EXAMPLES:
5 affirmative tú commands in context.

PHASE 3 - QUIZ (15 questions):
Form affirmative tú commands. Include regular and irregular.
Use Castilian Spanish with vosotros.
```

---

#### 59. `learning.spanish.grammar.imperative_vosotros_affirmative.v1`

**Activity:** Affirmative Vosotros Commands

**Prompt:**
```
LESSON: Affirmative Vosotros Commands

PHASE 1 - TEACH:
Formation: Replace infinitive -r with -d
- hablar → ¡Hablad! (Speak! - you all)
- comer → ¡Comed! (Eat!)
- escribir → ¡Escribid! (Write!)

No irregular vosotros commands! All follow the -d rule:
- decir → decid, hacer → haced, ir → id, venir → venid

Examples in context:
- Escuchad bien. (Listen carefully, all of you)
- Sentaos. (Sit down - reflexive, see note)
- Venid aquí. (Come here)

Note: With reflexive "os", the -d drops:
- sentad + os → sentaos (NOT sentados)
- Exception: irse → idos (not "íos")

PHASE 2 - EXAMPLES:
5 affirmative vosotros commands.

PHASE 3 - QUIZ (15 questions):
Form vosotros commands. Include reflexive forms.
Use Castilian Spanish with vosotros.
```

---

#### 60. `learning.spanish.grammar.imperative_usted_ustedes.v1`

**Activity:** Usted/Ustedes Commands (Formal)

**Prompt:**
```
LESSON: Formal Commands - Usted/Ustedes

PHASE 1 - TEACH:
Usted/Ustedes commands use PRESENT SUBJUNCTIVE forms:

-AR verbs: use -e/-en endings
- hablar → ¡Hable! / ¡Hablen!

-ER/-IR verbs: use -a/-an endings
- comer → ¡Coma! / ¡Coman!
- escribir → ¡Escriba! / ¡Escriban!

Same for affirmative AND negative (unlike tú):
- Hable más despacio, por favor. (Speak more slowly)
- No hable tan rápido. (Don't speak so fast)

Irregular (same as present subjunctive):
- ir → vaya/vayan, ser → sea/sean, saber → sepa/sepan

PHASE 2 - EXAMPLES:
5 formal commands in polite contexts.

PHASE 3 - QUIZ (15 questions):
Form usted/ustedes commands. Include irregular verbs.
Use Castilian Spanish with vosotros.
```

---

#### 61. `learning.spanish.grammar.imperative_nosotros.v1`

**Activity:** Nosotros Commands (Let's...)

**Prompt:**
```
LESSON: Nosotros Commands - Let's...

PHASE 1 - TEACH:
Two ways to say "Let's...":
1. Vamos a + infinitive (more common in speech)
   - Vamos a comer. (Let's eat)

2. Present subjunctive nosotros form (more formal)
   - Comamos. (Let's eat)
   - Hablemos. (Let's talk)
   - Salgamos. (Let's leave)

Negative: NO + subjunctive only
- No comamos todavía. (Let's not eat yet)
- No hablemos de eso. (Let's not talk about that)

Special: "Let's go"
- Everyday "let's go!": ¡Vamos! / ¡Vámonos!
- “Vayamos …” exists in set phrases (e.g., vayamos al grano), but don’t use it as the default for “let’s go”.
- Negative: No vayamos.

PHASE 2 - EXAMPLES:
5 nosotros commands (suggestions for group action).

PHASE 3 - QUIZ (15 questions):
Form nosotros commands. Include negative forms.
Use Castilian Spanish with vosotros.
```

---

### Negative Commands (4)

---

#### 62. `learning.spanish.grammar.imperative_negative_tu.v1`

**Activity:** Negative Tú Commands

**Prompt:**
```
LESSON: Negative Tú Commands

PHASE 1 - TEACH:
Negative tú commands use PRESENT SUBJUNCTIVE:
NO + present subjunctive (tú form)

-AR verbs: no + -es
- hablar → ¡No hables! (Don't speak!)

-ER/-IR verbs: no + -as
- comer → ¡No comas! (Don't eat!)
- escribir → ¡No escribas! (Don't write!)

Compare affirmative vs negative:
- ¡Habla! vs ¡No hables!
- ¡Come! vs ¡No comas!
- ¡Di! (irregular) vs ¡No digas! (subjunctive)

Irregulars follow subjunctive patterns:
- ir → No vayas, ser → No seas, dar → No des

PHASE 2 - EXAMPLES:
5 pairs of affirmative vs negative tú commands.

PHASE 3 - QUIZ (15 questions):
Form negative tú commands. Contrast with affirmative.
Use Castilian Spanish with vosotros.
```

---

#### 63. `learning.spanish.grammar.imperative_negative_vosotros.v1`

**Activity:** Negative Vosotros Commands

**Prompt:**
```
LESSON: Negative Vosotros Commands

PHASE 1 - TEACH:
Negative vosotros commands use PRESENT SUBJUNCTIVE:
NO + present subjunctive (vosotros form)

- hablar → ¡No habléis! (Don't speak! - you all)
- comer → ¡No comáis! (Don't eat!)
- escribir → ¡No escribáis! (Don't write!)

Compare affirmative vs negative:
- ¡Hablad! vs ¡No habléis!
- ¡Comed! vs ¡No comáis!
- ¡Venid! vs ¡No vengáis!

Note the accent on the subjunctive forms!

Irregulars (subjunctive forms):
- ir → No vayáis, ser → No seáis, estar → No estéis

PHASE 2 - EXAMPLES:
5 pairs of affirmative vs negative vosotros commands.

PHASE 3 - QUIZ (15 questions):
Form negative vosotros commands. Include spelling changes.
Use Castilian Spanish with vosotros.
```

---

#### 64. `learning.spanish.grammar.imperative_irregulars_tu.v1`

**Activity:** Irregular Tú Commands - The 8 Exceptions

**Prompt:**
```
LESSON: 8 Irregular Affirmative Tú Commands

PHASE 1 - TEACH:
Memorize these 8 irregular affirmative tú commands:

1. decir → di (say/tell)
2. hacer → haz (do/make)
3. ir → ve (go)
4. poner → pon (put)
5. salir → sal (leave/go out)
6. ser → sé (be)
7. tener → ten (have)
8. venir → ven (come)

Mnemonic: "Di Haz Ve Pon Sal Sé Ten Ven" (Say Do Go Put Leave Be Have Come)

Compounds follow the same pattern:
- proponer → propón, mantener → mantén, venir → ven

Negative forms are REGULAR (subjunctive):
- di → no digas, haz → no hagas, ve → no vayas

PHASE 2 - EXAMPLES:
5 sentences using irregular tú commands.

PHASE 3 - QUIZ (15 questions):
Practice all 8 irregular commands. Include negative forms.
Use Castilian Spanish with vosotros.
```

---

#### 65. `learning.spanish.grammar.imperative_irregulars_all.v1`

**Activity:** Irregular Commands - All Forms Summary

**Prompt:**
```
LESSON: Irregular Commands - Complete Overview

PHASE 1 - TEACH:
Key irregular verbs across all command forms:

IR:
- tú: ve / no vayas
- vosotros: id / no vayáis
- usted: vaya / no vaya
- nosotros: vamos / no vayamos

SER:
- tú: sé / no seas
- vosotros: sed / no seáis
- usted: sea / no sea
- nosotros: seamos / no seamos

HACER:
- tú: haz / no hagas
- vosotros: haced / no hagáis
- usted: haga / no haga

DECIR:
- tú: di / no digas
- vosotros: decid / no digáis
- usted: diga / no diga

PHASE 2 - EXAMPLES:
5 sentences with irregular commands in different forms.

PHASE 3 - QUIZ (15 questions):
Mixed irregular command forms. All persons.
Use Castilian Spanish with vosotros.
```

---

### Commands with Pronouns (4)

---

#### 66. `learning.spanish.grammar.imperative_pronouns_affirmative.v1`

**Activity:** Affirmative Commands with Object Pronouns

**Prompt:**
```
LESSON: Attaching Pronouns to Affirmative Commands

PHASE 1 - TEACH:
In AFFIRMATIVE commands, pronouns ATTACH to the end:
- Dámelo. (Give it to me)
- Hazlo. (Do it)
- Ponlo aquí. (Put it here)
- Díselo. (Tell it to him/her)

Written accent needed to maintain stress:
- Habla → Háblame (speak to me)
- Come → Cómelo (eat it)
- Escribe → Escríbeme (write to me)

Order when multiple pronouns: INDIRECT before DIRECT
- Da + me + lo → Dámelo
- Di + le + lo → Díselo (le → se before lo/la)

PHASE 2 - EXAMPLES:
5 affirmative commands with attached pronouns.

PHASE 3 - QUIZ (15 questions):
Attach pronouns to affirmative commands. Add accents correctly.
Use Castilian Spanish with vosotros.
```

---

#### 67. `learning.spanish.grammar.imperative_pronouns_negative.v1`

**Activity:** Negative Commands with Object Pronouns

**Prompt:**
```
LESSON: Pronouns with Negative Commands

PHASE 1 - TEACH:
In NEGATIVE commands, pronouns go BEFORE the verb:
- No me lo des. (Don't give it to me)
- No lo hagas. (Don't do it)
- No me hables. (Don't talk to me)
- No se lo digas. (Don't tell him/her)

Compare affirmative vs negative:
- Dámelo. → No me lo des.
- Hazlo. → No lo hagas.
- Díselo. → No se lo digas.

Order remains: indirect before direct
- No me lo digas. (Don't tell me it)
- No se lo des. (Don't give it to him/her)

PHASE 2 - EXAMPLES:
5 negative commands with pronouns placed correctly.

PHASE 3 - QUIZ (15 questions):
Form negative commands with pronouns. Contrast with affirmative.
Use Castilian Spanish with vosotros.
```

---

#### 68. `learning.spanish.grammar.imperative_double_pronouns.v1`

**Activity:** Commands with Double Object Pronouns

**Prompt:**
```
LESSON: Double Object Pronouns in Commands

PHASE 1 - TEACH:
Order: Reflexive/Indirect FIRST, then Direct
- me/te/se/nos/os + lo/la/los/las

LE/LES becomes SE before lo/la/los/las:
- Dale el libro → Dáselo (NOT "Dalelo")
- Dile la verdad → Dísela

Affirmative (attached + accent):
- Dámelo (give it to me)
- Cómpraselo (buy it for him/her)
- Escríbenosla (write it to us)

Negative (before verb):
- No me lo des
- No se lo compres
- No nos la escribas

PHASE 2 - EXAMPLES:
5 commands with double pronouns.

PHASE 3 - QUIZ (15 questions):
Use double pronouns in commands. Include le→se change.
Use Castilian Spanish with vosotros.
```

---

#### 69. `learning.spanish.grammar.imperative_review.v1`

**Activity:** Imperative - Comprehensive Review

**Prompt:**
```
LESSON: Commands Comprehensive Review

PHASE 1 - TEACH:
Quick reference:

TÚ:
- Affirmative: él form (+ 8 irregulars)
- Negative: no + subjunctive

VOSOTROS:
- Affirmative: infinitive -r → -d
- Negative: no + subjunctive

USTED/USTEDES:
- Both: subjunctive forms

NOSOTROS:
- Both: subjunctive (or vamos a + inf)

PRONOUNS:
- Affirmative: attached (with accent)
- Negative: before verb

PHASE 2 - EXAMPLES:
5 mixed command sentences covering all forms.

PHASE 3 - QUIZ (15 questions):
Mixed imperative practice. All forms, pronouns, affirmative/negative.
Use Castilian Spanish with vosotros.
```

---

## 5. SER VS ESTAR (8 cards)

---

#### 70. `learning.spanish.grammar.ser_estar_core.v1`

**Activity:** Ser vs Estar - Core Distinction

**Prompt:**
```
LESSON: Ser vs Estar - The Fundamental Difference

PHASE 1 - TEACH:
Classic rule: SER = permanent, ESTAR = temporary
Better rule: SER = essence/identity, ESTAR = state/condition

SER for:
- Identity: Soy profesor. (I am a teacher)
- Origin: Es de España. (He's from Spain)
- Material: La mesa es de madera. (The table is made of wood)
- Time/Date: Son las tres. Es lunes. (It's 3. It's Monday)
- Characteristics: Es alto. Es inteligente. (He's tall. He's intelligent)

ESTAR for:
- Location: Estoy en casa. (I'm at home)
- Temporary states: Estoy cansado. (I'm tired)
- Conditions: La puerta está abierta. (The door is open)
- Feelings: Estoy feliz. (I'm happy - right now)

PHASE 2 - EXAMPLES:
5 contrasting pairs showing ser vs estar.

PHASE 3 - QUIZ (15 questions):
Choose ser or estar based on context.
Use Castilian Spanish with vosotros.
```

---

#### 71. `learning.spanish.grammar.ser_estar_adjective_change.v1`

**Activity:** Adjectives That Change Meaning with Ser/Estar

**Prompt:**
```
LESSON: Ser vs Estar - Meaning Changes

PHASE 1 - TEACH:
Some adjectives have DIFFERENT meanings with ser vs estar:

- ser listo = to be clever / estar listo = to be ready
- ser malo = to be bad (person) / estar malo = to be sick
- ser bueno = to be good (person) / estar bueno = to taste good / be attractive
- ser aburrido = to be boring / estar aburrido = to be bored
- ser rico = to be rich / estar rico = to taste delicious
- ser verde = to be green (color) / estar verde = to be unripe
- ser vivo = to be lively/clever / estar vivo = to be alive
- ser orgulloso = to be arrogant / estar orgulloso = to be proud (of something)

PHASE 2 - EXAMPLES:
5 pairs showing meaning change with same adjective.

PHASE 3 - QUIZ (15 questions):
Choose ser or estar based on intended meaning.
Use Castilian Spanish with vosotros.
```

---

#### 72. `learning.spanish.grammar.ser_estar_location.v1`

**Activity:** Ser vs Estar for Location and Events

**Prompt:**
```
LESSON: Location of Things vs Location of Events

PHASE 1 - TEACH:
ESTAR for location of THINGS/PEOPLE:
- El libro está en la mesa. (The book is on the table)
- Madrid está en España. (Madrid is in Spain)
- ¿Dónde estás? (Where are you?)

SER for location of EVENTS:
- La fiesta es en mi casa. (The party is at my house)
- La reunión es en la oficina. (The meeting is at the office)
- El concierto es en el estadio. (The concert is at the stadium)

Test: Can you replace with "takes place"?
- La fiesta es (takes place) en mi casa. ✓ = SER
- El libro está (takes place) en la mesa. ✗ = ESTAR

PHASE 2 - EXAMPLES:
5 sentences distinguishing thing-location from event-location.

PHASE 3 - QUIZ (15 questions):
Choose ser or estar for location. Include events and objects.
Use Castilian Spanish with vosotros.
```

---

#### 73. `learning.spanish.grammar.ser_estar_passive.v1`

**Activity:** Ser vs Estar - Passive vs Resultant State

**Prompt:**
```
LESSON: Passive Voice (Ser) vs Resultant State (Estar)

PHASE 1 - TEACH:
SER + participle = PASSIVE VOICE (action happening)
- El libro fue escrito por Cervantes. (The book was written by Cervantes)
- La puerta fue abierta por el portero. (The door was opened by the doorman)
  (For “is being opened” right now: La puerta está siendo abierta…)

ESTAR + participle = RESULTANT STATE (result of action)
- El libro está escrito en español. (The book is written in Spanish - it's in that state)
- La puerta está abierta. (The door is open - state)

Compare:
- La ventana fue rota por los niños. (The window was broken by the children - action)
- La ventana está rota. (The window is broken - current state)

PHASE 2 - EXAMPLES:
5 pairs contrasting passive voice and resultant state.

PHASE 3 - QUIZ (15 questions):
Choose ser or estar with participles.
Use Castilian Spanish with vosotros.
```

---

#### 74. `learning.spanish.grammar.ser_estar_profession_origin.v1`

**Activity:** Ser for Identity, Profession, Origin

**Prompt:**
```
LESSON: Ser - Identity, Profession, Origin, Religion

PHASE 1 - TEACH:
Use SER for fundamental identity:

PROFESSION (no article in Spanish!):
- Soy médico. (I'm a doctor)
- Es profesora. (She's a teacher)
- Son ingenieros. (They're engineers)

ORIGIN:
- Soy de Madrid. (I'm from Madrid)
- ¿De dónde eres? (Where are you from?)
- Es española. (She's Spanish)

RELIGION/POLITICS:
- Es católico. (He's Catholic)
- Son demócratas. (They're Democrats)

RELATIONSHIP:
- Es mi hermano. (He's my brother)
- Somos amigos. (We're friends)

PHASE 2 - EXAMPLES:
5 sentences using ser for identity categories.

PHASE 3 - QUIZ (15 questions):
Practice ser for identity. Include professions without articles.
Use Castilian Spanish with vosotros.
```

---

#### 75. `learning.spanish.grammar.ser_estar_emotions.v1`

**Activity:** Ser vs Estar for Emotions and Conditions

**Prompt:**
```
LESSON: Emotions and Conditions - Ser vs Estar

PHASE 1 - TEACH:
ESTAR for CURRENT emotional state:
- Estoy contento. (I'm happy - now)
- Está enfadado. (He's angry - now)
- Estamos preocupados. (We're worried)

SER for CHARACTERISTIC personality:
- Es feliz. (He's a happy person - general)
- Es nervioso. (He's a nervous person - always)
- Es pesimista. (She's pessimistic - by nature)

Compare:
- Es triste. (He's a sad person by nature)
- Está triste. (He's sad right now)

Health always uses ESTAR:
- Estoy enfermo. (I'm sick)
- ¿Cómo estás? Estoy bien. (How are you? I'm fine)

PHASE 2 - EXAMPLES:
5 sentences distinguishing emotional states from personality traits.

PHASE 3 - QUIZ (15 questions):
Choose ser or estar for emotions/conditions.
Use Castilian Spanish with vosotros.
```

---

#### 76. `learning.spanish.grammar.ser_estar_time.v1`

**Activity:** Ser for Time, Dates, and Events

**Prompt:**
```
LESSON: Ser with Time and Date Expressions

PHASE 1 - TEACH:
Use SER for:

TIME:
- ¿Qué hora es? Son las tres. (What time is it? It's 3.)
- Es la una. (It's 1 o'clock - singular!)
- Era medianoche. (It was midnight)

DAYS/DATES:
- ¿Qué día es? Es lunes. (What day is it? It's Monday)
- Es 15 de enero. (It's January 15th)
- Hoy es mi cumpleaños. (Today is my birthday)

SEASONS/PERIODS:
- Es verano. (It's summer)
- Era de noche. (It was nighttime)

WEATHER with nouns: Es un día soleado. (It's a sunny day)
But HACER for weather expressions: Hace calor. (It's hot)

PHASE 2 - EXAMPLES:
5 sentences using ser for time and dates.

PHASE 3 - QUIZ (15 questions):
Practice time and date expressions with ser.
Use Castilian Spanish with vosotros.
```

---

#### 77. `learning.spanish.grammar.ser_estar_review.v1`

**Activity:** Ser vs Estar - Comprehensive Review

**Prompt:**
```
LESSON: Ser vs Estar Comprehensive Practice

PHASE 1 - TEACH:
Quick decision guide:

USE SER FOR:
- Identity/profession: Soy médico
- Origin: Es de México
- Material: Es de plástico
- Time/dates: Son las 5, Es lunes
- Events: La fiesta es aquí
- Characteristics: Es alto, inteligente
- Passive voice: Fue construido

USE ESTAR FOR:
- Location of things: Está en la mesa
- Temporary states: Estoy cansado
- Current emotions: Estoy feliz
- Health: Estoy enfermo
- Resultant states: Está abierto
- Progressive: Estoy comiendo

REMEMBER: Some adjectives change meaning!

PHASE 2 - EXAMPLES:
5 tricky sentences requiring careful ser/estar choice.

PHASE 3 - QUIZ (15 questions):
Mixed ser/estar scenarios. Include meaning-change adjectives.
Use Castilian Spanish with vosotros.
```

---

## 6. PRETERITE VS IMPERFECT (8 cards)

---

#### 78. `learning.spanish.grammar.pret_imp_core.v1`

**Activity:** Preterite vs Imperfect - Core Distinction

**Prompt:**
```
LESSON: Preterite vs Imperfect - The Fundamental Difference

PHASE 1 - TEACH:
PRETERITE = Completed action (beginning/end clear)
IMPERFECT = Ongoing/habitual action (no defined end)

PRETERITE for:
- Single completed actions: Comí a las 2. (I ate at 2)
- Chain of events: Entré, vi la nota y salí. (I entered, saw the note, and left)
- Specific duration: Viví allí 5 años. (I lived there 5 years - completed)

IMPERFECT for:
- Descriptions: Era alto y tenía ojos azules. (He was tall and had blue eyes)
- Ongoing: Mientras comía, sonó el teléfono. (While I was eating...)
- Habitual: Siempre iba al parque. (I always used to go to the park)
- Age/Time/Weather: Tenía 10 años. Eran las 3. Hacía frío.

PHASE 2 - EXAMPLES:
5 contrasting pairs showing preterite vs imperfect.

PHASE 3 - QUIZ (15 questions):
Choose preterite or imperfect based on context.
Use Castilian Spanish with vosotros.
```

---

#### 79. `learning.spanish.grammar.pret_imp_triggers.v1`

**Activity:** Time Expressions for Preterite vs Imperfect

**Prompt:**
```
LESSON: Trigger Words for Past Tenses

PHASE 1 - TEACH:
PRETERITE triggers (specific time/completion):
- ayer (yesterday)
- anoche (last night)
- la semana pasada (last week)
- el año pasado (last year)
- de repente (suddenly)
- una vez (once)
- dos veces (twice)

IMPERFECT triggers (habitual/ongoing):
- siempre (always)
- a menudo / frecuentemente (often)
- todos los días (every day)
- cada verano (every summer)
- mientras (while)
- de niño/joven (as a child/young person)
- generalmente (generally)

PHASE 2 - EXAMPLES:
5 sentences showing trigger word → tense choice.

PHASE 3 - QUIZ (15 questions):
Complete sentences choosing tense based on trigger words.
Use Castilian Spanish with vosotros.
```

---

#### 80. `learning.spanish.grammar.pret_imp_description_action.v1`

**Activity:** Description (Imperfect) vs Action (Preterite)

**Prompt:**
```
LESSON: Setting the Scene vs Advancing the Plot

PHASE 1 - TEACH:
In narratives:
IMPERFECT = Background, description, setting
PRETERITE = Main events, plot advancement

Example narrative:
"Era una noche oscura. (description - imperfect)
Llovía mucho. (description - imperfect)
De repente, oí un ruido. (main event - preterite)
Me levanté y abrí la puerta. (actions - preterite)
No había nadie. (description of state - imperfect)"

Think of imperfect as the "camera" showing the scene,
preterite as the "action" that happens in that scene.

PHASE 2 - EXAMPLES:
5 short narrative passages mixing both tenses.

PHASE 3 - QUIZ (15 questions):
Complete narratives with correct tense for description vs action.
Use Castilian Spanish with vosotros.
```

---

#### 81. `learning.spanish.grammar.pret_imp_habits.v1`

**Activity:** Habitual Past (Imperfect) vs Single Event (Preterite)

**Prompt:**
```
LESSON: "Used to" vs "Did"

PHASE 1 - TEACH:
IMPERFECT for habits ("used to" / "would"):
- De niño, jugaba al fútbol. (As a child, I used to play soccer)
- Siempre comíamos a las 2. (We always ate at 2)
- Iba a la playa cada verano. (I went to the beach every summer)

PRETERITE for single/countable events:
- Ayer jugué al fútbol. (Yesterday I played soccer)
- Comimos a las 2. (We ate at 2 - once)
- Fui a la playa el verano pasado. (I went to the beach last summer)

Test: Can you add "used to" or "every day"?
- "I played soccer" → Did you mean once or habitually?

PHASE 2 - EXAMPLES:
5 pairs contrasting single event vs habitual past.

PHASE 3 - QUIZ (15 questions):
Distinguish habitual from single-event contexts.
Use Castilian Spanish with vosotros.
```

---

#### 82. `learning.spanish.grammar.pret_imp_interruption.v1`

**Activity:** Interrupted Actions (Imperfect + Preterite)

**Prompt:**
```
LESSON: Ongoing Action Interrupted by Another Action

PHASE 1 - TEACH:
Classic pattern: IMPERFECT (ongoing) + PRETERITE (interruption)

mientras + imperfect... preterite
cuando + imperfect... preterite

Examples:
- Mientras dormía, sonó el teléfono.
  (While I was sleeping, the phone rang)
- Cuando caminaba por la calle, vi a Juan.
  (When/While I was walking down the street, I saw Juan)
- Estaba duchándome cuando llegaste.
  (I was showering when you arrived)

The imperfect is the "background" action;
the preterite is what "happened" during it.

PHASE 2 - EXAMPLES:
5 interrupted action sentences.

PHASE 3 - QUIZ (15 questions):
Create interrupted action sentences with correct tenses.
Use Castilian Spanish with vosotros.
```

---

#### 83. `learning.spanish.grammar.pret_imp_age_weather_time.v1`

**Activity:** Age, Weather, and Time in the Past

**Prompt:**
```
LESSON: Age, Weather, Time - Usually Imperfect

PHASE 1 - TEACH:
These typically use IMPERFECT (describing state/background):

AGE:
- Tenía 10 años cuando nos mudamos. (I was 10 when we moved)
- ¿Cuántos años tenías? (How old were you?)

TIME:
- Eran las 3 de la tarde. (It was 3 PM)
- Era medianoche cuando llegamos. (It was midnight when we arrived)

WEATHER:
- Hacía mucho calor. (It was very hot)
- Llovía mucho ese día. (It was raining a lot that day)
- Nevaba cuando salí. (It was snowing when I left)

Exception: Completed weather event with preterite:
- Ayer llovió todo el día. (Yesterday it rained all day - completed event)

PHASE 2 - EXAMPLES:
5 sentences with age, weather, or time in past.

PHASE 3 - QUIZ (15 questions):
Practice past tense with age, weather, and time expressions.
Use Castilian Spanish with vosotros.
```

---

#### 84. `learning.spanish.grammar.pret_imp_meaning_change.v1`

**Activity:** Verbs That Change Meaning (Conocer, Saber, Poder)

**Prompt:**
```
LESSON: Verbs with Different Meanings in Preterite vs Imperfect

PHASE 1 - TEACH:
Some verbs have different translations:

CONOCER:
- Conocía a Juan. (I knew Juan - ongoing state)
- Conocí a Juan. (I met Juan - the moment of meeting)

SABER:
- Sabía la verdad. (I knew the truth - ongoing)
- Supe la verdad. (I found out the truth - moment of discovery)

PODER:
- Podía nadar. (I was able to swim / could swim - ability)
- Pude nadar. (I managed to swim - succeeded)
- No pude abrir la puerta. (I couldn't open the door - tried and failed)

QUERER:
- Quería ir. (I wanted to go - ongoing desire)
- Quise ir. (I tried to go)
- No quise ir. (I refused to go)

PHASE 2 - EXAMPLES:
5 pairs showing meaning change with these verbs.

PHASE 3 - QUIZ (15 questions):
Choose correct tense based on intended meaning.
Use Castilian Spanish with vosotros.
```

---

#### 85. `learning.spanish.grammar.pret_imp_narrative.v1`

**Activity:** Preterite & Imperfect in Narrative Writing

**Prompt:**
```
LESSON: Telling Stories with Both Tenses

PHASE 1 - TEACH:
In a story, use both tenses together:

IMPERFECT for:
- Setting the scene
- Describing characters
- Background information
- Ongoing states

PRETERITE for:
- Main events
- Actions that move the story forward
- Completed events
- Changes of state

Example paragraph:
"Era un día soleado. Los pájaros cantaban. María caminaba por el parque
cuando de repente vio algo extraño. Se acercó y descubrió una caja antigua.
La abrió y encontró una carta..."

PHASE 2 - EXAMPLES:
2 short narrative passages analyzing tense choices.

PHASE 3 - QUIZ (15 questions):
Complete narrative gaps with correct tenses. Write short narratives.
Use Castilian Spanish with vosotros.
```

---

## 7. POR VS PARA (6 cards)

---

#### 86. `learning.spanish.grammar.por_para_purpose_cause.v1`

**Activity:** Para (Purpose) vs Por (Cause/Motive)

**Prompt:**
```
LESSON: Por vs Para - Purpose and Cause

PHASE 1 - TEACH:
PARA = Purpose, goal, intention (looking FORWARD)
- Estudio para aprender. (I study in order to learn)
- Este regalo es para ti. (This gift is for you - destination)
- Necesito dinero para el viaje. (I need money for the trip)

POR = Cause, reason, motive (looking BACK)
- Lo hago por ti. (I do it because of you / for your sake)
- Gracias por tu ayuda. (Thanks for your help - because of)
- Cerrado por reformas. (Closed due to renovations)

Test: "In order to" = PARA / "Because of" = POR
- Trabajo para ganar dinero. (to earn)
- Trabajo por necesidad. (because of need)

PHASE 2 - EXAMPLES:
5 pairs contrasting para (purpose) vs por (cause).

PHASE 3 - QUIZ (15 questions):
Choose por or para based on purpose vs cause.
Use Castilian Spanish with vosotros.
```

---

#### 87. `learning.spanish.grammar.por_para_movement.v1`

**Activity:** Por (Through) vs Para (Toward/Destination)

**Prompt:**
```
LESSON: Por vs Para - Movement and Direction

PHASE 1 - TEACH:
PARA = Destination, direction toward
- Salgo para Madrid. (I'm leaving for Madrid)
- Va para la oficina. (He's heading to the office)
- El tren para Barcelona. (The train to Barcelona)

POR = Through, along, around, via
- Pasé por el parque. (I passed through the park)
- Caminamos por la playa. (We walked along the beach)
- Entró por la ventana. (He entered through the window)
- Fui por la autopista. (I went via the highway)

Compare:
- Voy para el centro. (I'm heading to downtown)
- Voy por el centro. (I'm going through downtown)

PHASE 2 - EXAMPLES:
5 sentences showing movement with por and para.

PHASE 3 - QUIZ (15 questions):
Choose por or para for movement and direction.
Use Castilian Spanish with vosotros.
```

---

#### 88. `learning.spanish.grammar.por_para_time.v1`

**Activity:** Por (Duration) vs Para (Deadline)

**Prompt:**
```
LESSON: Por vs Para - Time Expressions

PHASE 1 - TEACH:
PARA = Deadline, due date
- Lo necesito para el lunes. (I need it by Monday)
- Tiene que estar listo para las 5. (It has to be ready by 5)
- Para entonces, ya habremos llegado. (By then, we'll have arrived)

POR = Duration, general time period
- Viví allí por dos años. (I lived there for two years)
- Estaré fuera por una semana. (I'll be away for a week)
- Por la mañana trabajo. (In the morning I work)
- Por la noche salimos. (At night we go out)

Note: Duration can also use "durante":
- Viví allí durante dos años. (same meaning)

PHASE 2 - EXAMPLES:
5 sentences with time expressions using por and para.

PHASE 3 - QUIZ (15 questions):
Choose por or para for time contexts.
Use Castilian Spanish with vosotros.
```

---

#### 89. `learning.spanish.grammar.por_para_recipient_exchange.v1`

**Activity:** Para (Recipient) vs Por (Exchange)

**Prompt:**
```
LESSON: Por vs Para - For Whom / In Exchange

PHASE 1 - TEACH:
PARA = Recipient, intended for
- Este regalo es para María. (This gift is for María)
- Compré flores para mi madre. (I bought flowers for my mother)
- Trabajo para una empresa grande. (I work for a big company)

POR = Exchange, substitution, on behalf of
- Pagué 50 euros por el libro. (I paid 50 euros for the book)
- Cambié mi coche por una moto. (I exchanged my car for a motorcycle)
- Habló por mí. (He spoke on my behalf)
- Gracias por todo. (Thanks for everything - in exchange for)

Compare:
- Lo hice para ti. (I did it for you - as a gift/intended for you)
- Lo hice por ti. (I did it for you - on your behalf/because of you)

PHASE 2 - EXAMPLES:
5 sentences distinguishing recipient from exchange.

PHASE 3 - QUIZ (15 questions):
Choose por or para for recipient/exchange contexts.
Use Castilian Spanish with vosotros.
```

---

#### 90. `learning.spanish.grammar.por_para_expressions.v1`

**Activity:** Fixed Expressions with Por and Para

**Prompt:**
```
LESSON: Common Fixed Expressions

PHASE 1 - TEACH:
Expressions with POR (memorize these):
- por favor (please)
- por supuesto (of course)
- por lo menos / por lo tanto (at least / therefore)
- por fin (finally)
- por ejemplo (for example)
- por eso (that's why)
- por lo general (in general)
- por cierto (by the way)

Expressions with PARA (memorize these):
- para siempre (forever)
- para nada (not at all)
- para colmo (to top it off)
- no es para tanto (it's not a big deal)
- para variar (for a change)
- estar para + infinitive (to be about to)

PHASE 2 - EXAMPLES:
5 sentences using fixed expressions.

PHASE 3 - QUIZ (15 questions):
Complete sentences with correct por/para expressions.
Use Castilian Spanish with vosotros.
```

---

#### 91. `learning.spanish.grammar.por_para_review.v1`

**Activity:** Por vs Para - Comprehensive Review

**Prompt:**
```
LESSON: Por vs Para Comprehensive Practice

PHASE 1 - TEACH:
Quick reference:

PARA (destination, purpose, deadline, recipient):
- Direction: para Madrid
- Purpose: para aprender
- Deadline: para el lunes
- Recipient: para ti
- Opinion: para mí (in my opinion)
- Comparison: alto para su edad (tall for his age)

POR (cause, through, duration, exchange, means):
- Cause: por amor, por necesidad
- Through: por el parque
- Duration: por dos horas
- Exchange: gracias por, pagué por
- Means: por teléfono, por correo
- Passive agent: escrito por Cervantes

PHASE 2 - EXAMPLES:
5 challenging sentences requiring careful por/para choice.

PHASE 3 - QUIZ (15 questions):
Mixed por/para scenarios. Include fixed expressions.
Use Castilian Spanish with vosotros.
```

---

## 8. PRONOUNS (12 cards)

### Object Pronouns (4)

---

#### 92. `learning.spanish.grammar.pronouns_direct_object.v1`

**Activity:** Direct Object Pronouns (Lo, La, Los, Las)

**Prompt:**
```
LESSON: Direct Object Pronouns

PHASE 1 - TEACH:
Direct object pronouns replace the thing/person receiving the action:
- me (me)
- te (you - informal)
- lo (him, it - masc.) / la (her, it - fem.)
- nos (us)
- os (you all - Spain)
- los (them - masc.) / las (them - fem.)

Position: BEFORE conjugated verb
- Veo el libro. → Lo veo. (I see it)
- Conozco a María. → La conozco. (I know her)
- ¿Compras los zapatos? → ¿Los compras? (Are you buying them?)

With infinitive/gerund: can attach or go before conjugated verb
- Voy a comprarlo. / Lo voy a comprar.

PHASE 2 - EXAMPLES:
5 sentences with direct object pronoun substitution.

PHASE 3 - QUIZ (15 questions):
Replace direct objects with pronouns. Position correctly.
Use Castilian Spanish with vosotros.
```

---

#### 93. `learning.spanish.grammar.pronouns_indirect_object.v1`

**Activity:** Indirect Object Pronouns (Me, Te, Le, Nos, Os, Les)

**Prompt:**
```
LESSON: Indirect Object Pronouns

PHASE 1 - TEACH:
Indirect object = TO/FOR whom the action is done:
- me (to me)
- te (to you)
- le (to him/her/you formal)
- nos (to us)
- os (to you all)
- les (to them/you all formal)

Examples:
- Doy el libro a Juan. → Le doy el libro. (I give him the book)
- Escribo una carta a mis padres. → Les escribo una carta.
- ¿Me puedes ayudar? (Can you help me?)

Note on "leísmo" (Spain): "le" sometimes used for male direct objects
- Le vi ayer. (I saw him yesterday) - accepted in Spain

PHASE 2 - EXAMPLES:
5 sentences with indirect object pronouns.

PHASE 3 - QUIZ (15 questions):
Identify and use indirect object pronouns.
Use Castilian Spanish with vosotros.
```

---

#### 94. `learning.spanish.grammar.pronouns_double.v1`

**Activity:** Double Object Pronouns

**Prompt:**
```
LESSON: Using Two Object Pronouns Together

PHASE 1 - TEACH:
Order: INDIRECT before DIRECT (I.D. = Indirect-Direct)
- Me lo das. (You give it to me)
- Te la compro. (I buy it for you)
- Nos los envían. (They send them to us)

IMPORTANT: Le/Les + lo/la/los/las → SE + lo/la/los/las
- Le doy el libro. → Se lo doy. (NOT "Le lo doy")
- Les cuento la historia. → Se la cuento.

Position rules same as single pronouns:
- Before conjugated verb: Se lo doy.
- Attached to infinitive: Voy a dárselo. (accent needed!)
- Attached to gerund: Estoy dándoselo.
- Attached to affirmative command: Dáselo.

PHASE 2 - EXAMPLES:
5 sentences with double object pronouns.

PHASE 3 - QUIZ (15 questions):
Combine both pronouns. Include le→se change.
Use Castilian Spanish with vosotros.
```

---

#### 95. `learning.spanish.grammar.pronouns_placement.v1`

**Activity:** Pronoun Placement Rules

**Prompt:**
```
LESSON: Where to Put Object Pronouns

PHASE 1 - TEACH:
BEFORE conjugated verb:
- Lo veo. (I see it)
- Te quiero. (I love you)

ATTACHED to infinitive (optional if with conjugated verb):
- Voy a verlo. / Lo voy a ver. (I'm going to see it)
- Quiero comprarlo. / Lo quiero comprar.

ATTACHED to gerund (optional if with conjugated verb):
- Estoy leyéndolo. / Lo estoy leyendo.

ATTACHED to affirmative command (REQUIRED):
- ¡Dámelo! (Give it to me!)
- ¡Hazlo! (Do it!)

BEFORE negative command (REQUIRED):
- ¡No me lo des! (Don't give it to me!)

PHASE 2 - EXAMPLES:
5 sentences demonstrating different placement rules.

PHASE 3 - QUIZ (15 questions):
Place pronouns correctly in various structures.
Use Castilian Spanish with vosotros.
```

---

### Relative Pronouns (4)

---

#### 96. `learning.spanish.grammar.pronouns_relative_que_quien.v1`

**Activity:** Que vs Quien - Relative Pronouns

**Prompt:**
```
LESSON: Relative Pronouns - Que and Quien

PHASE 1 - TEACH:
QUE = most common relative pronoun (that, which, who)
- El libro que leí. (The book that I read)
- La mujer que vino. (The woman who came)
- La casa que compramos. (The house that we bought)

QUIEN/QUIENES = for people, especially after prepositions
- La persona con quien hablé. (The person with whom I spoke)
- Los amigos a quienes invité. (The friends whom I invited)
- Quien mucho abarca, poco aprieta. (He who tries to grab too much...)

After preposition + person: quien preferred
- El profesor de quien te hablé. (The professor of whom I told you)
- La chica con quien salgo. (The girl with whom I'm going out)

PHASE 2 - EXAMPLES:
5 sentences using que and quien appropriately.

PHASE 3 - QUIZ (15 questions):
Choose between que and quien. Include prepositions.
Use Castilian Spanish with vosotros.
```

---

#### 97. `learning.spanish.grammar.pronouns_relative_el_cual.v1`

**Activity:** El cual, La cual, Cuyo - Formal Relatives

**Prompt:**
```
LESSON: El cual and Cuyo

PHASE 1 - TEACH:
EL CUAL / LA CUAL / LOS CUALES / LAS CUALES
(which, who - formal, after prepositions, for clarity)
- La razón por la cual vine. (The reason for which I came)
- El edificio delante del cual vivo. (The building in front of which I live)
- Los libros, los cuales son muy caros... (The books, which are very expensive...)

CUYO/CUYA/CUYOS/CUYAS = whose (agrees with possessed, not possessor!)
- El hombre cuya casa es grande. (The man whose house is big)
- La mujer cuyos hijos estudian. (The woman whose children study)
- El país cuyas playas son famosas. (The country whose beaches are famous)

Cuyo agrees with what follows, not what precedes!

PHASE 2 - EXAMPLES:
5 sentences using el cual and cuyo.

PHASE 3 - QUIZ (15 questions):
Practice el cual forms and cuyo agreement.
Use Castilian Spanish with vosotros.
```

---

#### 98. `learning.spanish.grammar.pronouns_relative_donde_cuando.v1`

**Activity:** Donde, Cuando, Como as Relatives

**Prompt:**
```
LESSON: Relative Adverbs - Donde, Cuando, Como

PHASE 1 - TEACH:
DONDE = where (replaces "en que" for places)
- La ciudad donde nací. (The city where I was born)
- El restaurante donde comimos. (The restaurant where we ate)
- Same as: La ciudad en la que nací.

CUANDO = when (for time references)
- El día cuando llegaste. (The day when you arrived)
- La época cuando vivíamos allí. (The time when we lived there)

COMO = how, the way (for manner)
- La manera como habla. (The way he speaks)
- No me gusta como lo hace. (I don't like how he does it)

With prepositions:
- La casa de donde viene. (The house from where he comes)
- El lugar hacia donde vamos. (The place toward where we're going)

PHASE 2 - EXAMPLES:
5 sentences using donde, cuando, and como as relatives.

PHASE 3 - QUIZ (15 questions):
Use relative adverbs in context.
Use Castilian Spanish with vosotros.
```

---

#### 99. `learning.spanish.grammar.pronouns_relative_lo_que.v1`

**Activity:** Lo que, Lo cual - Neuter Relatives

**Prompt:**
```
LESSON: Neuter Relatives - Lo que, Lo cual

PHASE 1 - TEACH:
LO QUE = what, that which (refers to idea, not specific noun)
- Lo que dices es verdad. (What you say is true)
- No entiendo lo que quieres. (I don't understand what you want)
- Eso es lo que necesito. (That's what I need)

LO CUAL = which (refers to entire previous clause)
- Llegó tarde, lo cual me molestó. (He arrived late, which annoyed me)
- No llamó, lo cual es extraño. (He didn't call, which is strange)

Compare:
- Lo que (what - introduces a concept)
- Lo cual (which - comments on previous idea)

Todo lo que = everything that
- Todo lo que dijo era mentira. (Everything he said was a lie)

PHASE 2 - EXAMPLES:
5 sentences using lo que and lo cual.

PHASE 3 - QUIZ (15 questions):
Use neuter relative pronouns correctly.
Use Castilian Spanish with vosotros.
```

---

### Other Pronouns (4)

---

#### 100. `learning.spanish.grammar.pronouns_reflexive_advanced.v1`

**Activity:** Se - Reflexive, Passive, and Impersonal Uses

**Prompt:**
```
LESSON: Advanced Uses of "Se"

PHASE 1 - TEACH:
SE has multiple functions:

1. REFLEXIVE (action on oneself):
   - Se lava. (He washes himself)
   - Se visten. (They get dressed)

2. RECIPROCAL (each other):
   - Se quieren. (They love each other)
   - Se escriben. (They write to each other)

3. PASSIVE SE (action done to something):
   - Se venden libros. (Books are sold)
   - Se habla español. (Spanish is spoken)

4. IMPERSONAL SE (one, people, you):
   - Se dice que... (It's said that... / They say...)
   - ¿Cómo se llega? (How does one get there?)
   - Aquí se come bien. (One eats well here)

PHASE 2 - EXAMPLES:
5 sentences showing different uses of se.

PHASE 3 - QUIZ (15 questions):
Identify and use different se functions.
Use Castilian Spanish with vosotros.
```

---

#### 101. `learning.spanish.grammar.pronouns_possessive_stressed.v1`

**Activity:** Stressed Possessive Pronouns (Mío, Tuyo, Suyo)

**Prompt:**
```
LESSON: Stressed Possessives - El mío, La tuya, etc.

PHASE 1 - TEACH:
Stressed possessives REPLACE the noun (or come after it):

Forms (agree in gender/number with possessed thing):
- mío/mía/míos/mías (mine)
- tuyo/tuya/tuyos/tuyas (yours)
- suyo/suya/suyos/suyas (his/hers/yours formal/theirs)
- nuestro/nuestra/nuestros/nuestras (ours)
- vuestro/vuestra/vuestros/vuestras (yours - plural)

With article (standalone): el mío, la tuya, los suyos
- ¿Dónde está tu libro? El mío está aquí. (Mine is here)
- Mi casa es grande. La tuya también. (Yours too)

After noun (for emphasis): un amigo mío (a friend of mine)
- Es un problema suyo. (It's a problem of his/hers)

PHASE 2 - EXAMPLES:
5 sentences using stressed possessives.

PHASE 3 - QUIZ (15 questions):
Replace nouns with possessive pronouns. Use after nouns.
Use Castilian Spanish with vosotros.
```

---

#### 102. `learning.spanish.grammar.pronouns_demonstrative.v1`

**Activity:** Demonstrative Pronouns (Este, Ese, Aquel)

**Prompt:**
```
LESSON: Demonstratives - This, That, That Over There

PHASE 1 - TEACH:
Three levels of distance:

ESTE/ESTA/ESTOS/ESTAS (this - near speaker)
- Este libro es mío. (This book is mine)
- Estos son mis amigos. (These are my friends)

ESE/ESA/ESOS/ESAS (that - near listener)
- Ese coche es nuevo. (That car is new)
- ¿Quieres esas? (Do you want those?)

AQUEL/AQUELLA/AQUELLOS/AQUELLAS (that - far from both)
- Aquel edificio es el museo. (That building over there is the museum)
- Aquellos tiempos eran mejores. (Those times were better)

Neuter forms (for concepts): esto, eso, aquello
- ¿Qué es esto? (What is this?)
- Eso no me gusta. (I don't like that)

PHASE 2 - EXAMPLES:
5 sentences using demonstratives at different distances.

PHASE 3 - QUIZ (15 questions):
Choose correct demonstrative based on distance/context.
Use Castilian Spanish with vosotros.
```

---

#### 103. `learning.spanish.grammar.pronouns_indefinite.v1`

**Activity:** Indefinite Pronouns (Algo, Alguien, Cualquier)

**Prompt:**
```
LESSON: Indefinite Pronouns and Adjectives

PHASE 1 - TEACH:
AFFIRMATIVE indefinites:
- algo (something) / nada (nothing)
- alguien (someone) / nadie (no one)
- alguno/algún (some) / ninguno/ningún (none)
- cualquier/cualquiera (any/anyone)
- todo (everything/all)

NEGATIVE indefinites (often with "no"):
- No hay nadie. (There's no one)
- No tengo nada. (I have nothing)
- No veo ningún problema. (I don't see any problem)

Double negatives required in Spanish:
- No viene nadie. (Nobody is coming) - NOT "Nadie viene" alone at start

CUALQUIERA (anyone/any):
- Cualquier persona puede entrar. (Any person can enter)
- Cualquiera lo sabe. (Anyone knows it)

PHASE 2 - EXAMPLES:
5 sentences with indefinite pronouns.

PHASE 3 - QUIZ (15 questions):
Use indefinites correctly. Include double negatives.
Use Castilian Spanish with vosotros.
```

---

## 9. PASSIVE VOICE & IMPERSONAL SE (6 cards)

---

#### 104. `learning.spanish.grammar.passive_ser.v1`

**Activity:** Passive Voice with Ser

**Prompt:**
```
LESSON: Traditional Passive - Ser + Past Participle

PHASE 1 - TEACH:
Formation: SER + PAST PARTICIPLE (+ por + agent)
Participle agrees with subject in gender/number!

- El libro fue escrito por Cervantes. (The book was written by Cervantes)
- La casa fue construida en 1900. (The house was built in 1900)
- Los documentos fueron firmados. (The documents were signed)
- Las cartas serán enviadas mañana. (The letters will be sent tomorrow)

Agent (who did it) uses "por":
- Fue diseñado por un arquitecto famoso.

This passive is more common in formal/written Spanish.
Spoken Spanish prefers active voice or pasiva refleja (se).

PHASE 2 - EXAMPLES:
5 sentences in passive voice with ser.

PHASE 3 - QUIZ (15 questions):
Transform active to passive. Include agent with por.
Use Castilian Spanish with vosotros.
```

---

#### 105. `learning.spanish.grammar.passive_se_refleja.v1`

**Activity:** Pasiva Refleja - Se + Verb (Passive with Se)

**Prompt:**
```
LESSON: Pasiva Refleja - Se venden libros

PHASE 1 - TEACH:
Formation: SE + VERB (3rd person) + SUBJECT
Verb agrees with the subject!

- Se vende esta casa. (This house is for sale / is sold)
- Se venden libros. (Books are sold)
- Se hablan varios idiomas. (Several languages are spoken)
- Se necesitan voluntarios. (Volunteers are needed)

Very common in:
- Signs: "Se alquila piso" (Apartment for rent)
- Announcements: "Se busca empleado" (Employee wanted)
- Shop notices: "Se venden entradas aquí" (Tickets sold here)

NO AGENT expressed (unlike ser passive):
- WRONG: Se venden libros por la librería.
- RIGHT: Los libros son vendidos por la librería. (use ser passive for agent)

PHASE 2 - EXAMPLES:
5 sentences with pasiva refleja.

PHASE 3 - QUIZ (15 questions):
Form pasiva refleja. Ensure verb-subject agreement.
Use Castilian Spanish with vosotros.
```

---

#### 106. `learning.spanish.grammar.passive_se_impersonal.v1`

**Activity:** Impersonal Se (One, People, You General)

**Prompt:**
```
LESSON: Impersonal Se - Se dice, Se cree

PHASE 1 - TEACH:
SE + 3rd person singular verb = general/impersonal statement

Used when there's no specific subject (one, people, you in general):
- Se dice que... (It's said that... / They say...)
- Se cree que... (It's believed that...)
- ¿Cómo se llega al centro? (How does one get downtown?)
- No se puede fumar aquí. (One cannot smoke here / Smoking not allowed)
- Se vive bien aquí. (One lives well here)
- Aquí se habla español. (Spanish is spoken here / People speak Spanish here)

Compare with pasiva refleja:
- Se venden libros. (Books are sold - pasiva refleja, plural verb)
- Se vende mucho aquí. (A lot is sold here - impersonal, singular verb)
- Se hablan tres idiomas en esta oficina. (Three languages are spoken - pasiva refleja, plural verb)

With "a" + person: Se + singular verb
- Se ayuda a los estudiantes. (Students are helped)

PHASE 2 - EXAMPLES:
5 impersonal se sentences.

PHASE 3 - QUIZ (15 questions):
Distinguish impersonal se from pasiva refleja.
Use Castilian Spanish with vosotros.
```

---

#### 107. `learning.spanish.grammar.passive_estar_resultant.v1`

**Activity:** Estar + Participle - Resultant State

**Prompt:**
```
LESSON: Estar + Participle vs Ser + Participle

PHASE 1 - TEACH:
ESTAR + participle = RESULTING STATE (no action implied)
SER + participle = PASSIVE ACTION (action happening)

Compare:
- La puerta FUE abierta por el portero. (The door was opened by the doorman - action)
- La puerta ESTÁ abierta. (The door is open - state)

More examples:
- El trabajo está terminado. (The work is finished - current state)
- El trabajo fue terminado ayer. (The work was finished yesterday - action)
- Estoy cansado. (I'm tired - state)
- La ciudad fue destruida. (The city was destroyed - event)
- La ciudad está destruida. (The city is destroyed - current state)

PHASE 2 - EXAMPLES:
5 pairs contrasting ser passive and estar resultant state.

PHASE 3 - QUIZ (15 questions):
Choose ser or estar with participles.
Use Castilian Spanish with vosotros.
```

---

#### 108. `learning.spanish.grammar.passive_agent_por.v1`

**Activity:** Expressing the Agent with Por

**Prompt:**
```
LESSON: Passive Agent - Por + Doer

PHASE 1 - TEACH:
In passive voice (ser + participle), the agent uses POR:
- El cuadro fue pintado POR Picasso.
- América fue descubierta POR Colón.
- La ley fue aprobada POR el parlamento.

Agent is often OMITTED when:
- Unknown: La ventana fue rota. (by whom? unknown)
- Unimportant: El paquete fue enviado ayer.
- Obvious: Fui operado la semana pasada. (by doctors, obviously)

DE instead of POR (rare, older usage, feelings):
- Es amado de todos. (He is loved by all)
- Es conocido de todos. (He is known by all)

Modern Spanish usually uses POR for all agents.

PHASE 2 - EXAMPLES:
5 passive sentences with explicit and omitted agents.

PHASE 3 - QUIZ (15 questions):
Add agents to passive sentences. Know when to omit.
Use Castilian Spanish with vosotros.
```

---

#### 109. `learning.spanish.grammar.passive_review.v1`

**Activity:** Passive Constructions - Comprehensive Review

**Prompt:**
```
LESSON: All Passive Constructions Review

PHASE 1 - TEACH:
Four ways to express passive meaning in Spanish:

1. SER + PARTICIPLE (formal, agent possible)
   - El libro fue escrito por Cervantes.

2. PASIVA REFLEJA (common, no agent)
   - Se venden libros. / Se hablan tres idiomas aquí.

3. IMPERSONAL SE (general statements)
   - Se dice que... / Aquí se habla español.

4. ESTAR + PARTICIPLE (resultant state)
   - La puerta está cerrada.

Choosing between them:
- Need to mention agent? → Use ser passive
- No agent, thing as subject? → Use pasiva refleja
- General statement, no specific subject? → Use impersonal se
- Describing current state? → Use estar + participle

PHASE 2 - EXAMPLES:
5 sentences using different passive constructions.

PHASE 3 - QUIZ (15 questions):
Choose appropriate passive construction for context.
Use Castilian Spanish with vosotros.
```

---

## 10. SUBJUNCTIVE VS INDICATIVE (10 cards)

---

#### 110. `learning.spanish.grammar.subj_ind_creer_pensar.v1`

**Activity:** Creer/Pensar - Affirmative vs Negative

**Prompt:**
```
LESSON: Creer, Pensar, Parecer - Indicative or Subjunctive?

PHASE 1 - TEACH:
AFFIRMATIVE = INDICATIVE (expressing belief = certainty)
- Creo que VIENE mañana. (I think he's coming)
- Pienso que TIENE razón. (I think he's right)
- Me parece que ESTÁ enfermo. (It seems to me he's sick)

NEGATIVE = SUBJUNCTIVE (expressing doubt)
- No creo que VENGA mañana. (I don't think he's coming)
- No pienso que TENGA razón. (I don't think he's right)
- No me parece que ESTÉ enfermo. (I don't think he's sick)

QUESTION = either (depends on speaker's expectation)
- ¿Crees que viene? (Do you think he's coming? - neutral)
- ¿Crees que venga? (Do you think he might come? - doubt)

PHASE 2 - EXAMPLES:
5 pairs contrasting affirmative/negative forms.

PHASE 3 - QUIZ (15 questions):
Choose indicative or subjunctive with belief verbs.
Use Castilian Spanish with vosotros.
```

---

#### 111. `learning.spanish.grammar.subj_ind_aunque.v1`

**Activity:** Aunque + Indicative vs Subjunctive

**Prompt:**
```
LESSON: Aunque - Fact vs Hypothesis

PHASE 1 - TEACH:
AUNQUE + INDICATIVE = conceding a FACT
- Aunque llueve, salgo. (Even though it IS raining, I'm going out)
- Aunque está cansado, trabaja. (Even though he IS tired, he works)
- Aunque no me gusta, lo como. (Even though I don't like it, I eat it)

AUNQUE + SUBJUNCTIVE = hypothetical or future possibility
- Aunque llueva, saldré. (Even if it rains, I'll go out)
- Aunque esté cansado, trabajará. (Even if he's tired, he'll work)
- Aunque no me guste, lo comeré. (Even if I don't like it, I'll eat it)

Key: Is it happening now (fact) or might it happen (hypothesis)?
- Aunque hace frío... (it IS cold - fact)
- Aunque haga frío... (if it's cold / should it be cold - hypothetical)

PHASE 2 - EXAMPLES:
5 pairs contrasting aunque + indicative vs subjunctive.

PHASE 3 - QUIZ (15 questions):
Choose correct mood with aunque based on context.
Use Castilian Spanish with vosotros.
```

---

#### 112. `learning.spanish.grammar.subj_ind_cuando.v1`

**Activity:** Cuando - Future vs Past/Present

**Prompt:**
```
LESSON: Cuando + Indicative vs Subjunctive

PHASE 1 - TEACH:
CUANDO + INDICATIVE = past or present habitual (known/experienced)
- Cuando era niño, jugaba mucho. (When I was a child, I played a lot)
- Cuando llega, siempre saluda. (When he arrives, he always says hello)
- Cuando lo vi, me sorprendí. (When I saw him, I was surprised)

CUANDO + SUBJUNCTIVE = future (not yet happened)
- Cuando llegue, te llamo. (When he arrives, I'll call you)
- Cuando tengas tiempo, hablamos. (When you have time, we'll talk)
- Cuando sea mayor, viajaré. (When I'm older, I'll travel)

Same rule applies to: hasta que, tan pronto como, en cuanto, después de que
- Esperaré hasta que vengas. (I'll wait until you come - future)
- Esperé hasta que vino. (I waited until he came - past)

PHASE 2 - EXAMPLES:
5 pairs contrasting past/habitual vs future cuando.

PHASE 3 - QUIZ (15 questions):
Choose indicative or subjunctive with cuando.
Use Castilian Spanish with vosotros.
```

---

#### 113. `learning.spanish.grammar.subj_ind_known_unknown.v1`

**Activity:** Known vs Unknown Antecedent

**Prompt:**
```
LESSON: Relative Clauses - Known vs Unknown

PHASE 1 - TEACH:
INDICATIVE = referring to something KNOWN to exist
- Busco al secretario que habla inglés. (I'm looking for THE secretary who speaks English - I know he exists)
- Tengo un amigo que sabe cocinar. (I have a friend who knows how to cook)

SUBJUNCTIVE = referring to something UNKNOWN or possibly non-existent
- Busco un secretario que hable inglés. (I'm looking for A secretary who speaks English - anyone who does)
- ¿Hay alguien que sepa la respuesta? (Is there anyone who knows the answer?)
- No hay nadie que pueda ayudarme. (There's no one who can help me)

Key words that trigger subjunctive:
- Negative antecedent: No hay nadie que..., No conozco a nadie que...
- Question about existence: ¿Hay algo que...?, ¿Conoces a alguien que...?
- Indefinite: Busco algo que..., Necesito a alguien que...

PHASE 2 - EXAMPLES:
5 pairs contrasting known vs unknown antecedent.

PHASE 3 - QUIZ (15 questions):
Choose mood based on known/unknown antecedent.
Use Castilian Spanish with vosotros.
```

---

#### 114. `learning.spanish.grammar.subj_ind_relative_clauses.v1`

**Activity:** Subjunctive in Relative Clauses - Practice

**Prompt:**
```
LESSON: Relative Clauses with Subjunctive - Deep Practice

PHASE 1 - TEACH:
More patterns requiring subjunctive in relative clauses:

NEGATIVE statements:
- No hay nada que me guste. (There's nothing I like)
- No conozco a nadie que haya estado allí. (I don't know anyone who's been there)

SUPERLATIVES with subjunctive (expressing opinion/uncertainty):
- Es la mejor película que haya visto. (It's the best movie I've seen)
- Es lo más difícil que hayamos hecho. (It's the hardest thing we've done)

INDEFINITE expressions:
- Cualquiera que sea el problema... (Whatever the problem may be)
- Dondequiera que vayas... (Wherever you go)
- Comoquiera que lo hagas... (However you do it)

PHASE 2 - EXAMPLES:
5 sentences with subjunctive in relative clauses.

PHASE 3 - QUIZ (15 questions):
Use subjunctive in relative clauses appropriately.
Use Castilian Spanish with vosotros.
```

---

#### 115. `learning.spanish.grammar.subj_ind_tal_vez.v1`

**Activity:** Tal vez, Quizás, Acaso - Maybe Expressions

**Prompt:**
```
LESSON: Expressions of Uncertainty - Quizás, Tal vez

PHASE 1 - TEACH:
Quizás, tal vez, acaso (maybe, perhaps) can take either mood:

SUBJUNCTIVE (more doubt, more common):
- Quizás venga mañana. (Maybe he'll come tomorrow)
- Tal vez llueva. (Perhaps it will rain)
- Acaso sea verdad. (Perhaps it's true)

INDICATIVE (more certainty, speaker leans toward yes):
- Quizás viene mañana. (Maybe he's coming tomorrow - I think so)
- Tal vez tienes razón. (Perhaps you're right - probably)

Position can affect mood:
- After verb often = indicative: Viene quizás mañana.
- Before verb = either, but subjunctive more common: Quizás venga.

A lo mejor = ALWAYS indicative:
- A lo mejor viene. (Maybe he'll come)

PHASE 2 - EXAMPLES:
5 sentences with uncertainty expressions.

PHASE 3 - QUIZ (15 questions):
Choose mood with quizás, tal vez, a lo mejor.
Use Castilian Spanish with vosotros.
```

---

#### 116. `learning.spanish.grammar.subj_ind_como_donde.v1`

**Activity:** Como, Donde, Adonde with Subjunctive

**Prompt:**
```
LESSON: Como, Donde, Cuanto with Subjunctive

PHASE 1 - TEACH:
These words can take subjunctive when expressing uncertainty or choice:

COMO (how, however):
- Hazlo como quieras. (Do it however you want)
- Como no vengas, me enfado. (If you don't come, I'll get angry)

DONDE (where, wherever):
- Siéntate donde quieras. (Sit wherever you want)
- Vamos donde tú digas. (Let's go wherever you say)

ADONDE (to wherever):
- Te sigo adonde vayas. (I'll follow you wherever you go)

CUANTO (as much as):
- Come cuanto quieras. (Eat as much as you want)

Compare with indicative (known):
- Lo hago como me enseñaste. (I do it as you taught me - known method)
- Hazlo como quieras. (Do it however you want - unknown/your choice)

PHASE 2 - EXAMPLES:
5 sentences with como, donde, cuanto + subjunctive.

PHASE 3 - QUIZ (15 questions):
Use subjunctive with these expressions for unknown/choice.
Use Castilian Spanish with vosotros.
```

---

#### 117. `learning.spanish.grammar.subj_ind_existence_knowledge.v1`

**Activity:** Existence and Knowledge Triggers

**Prompt:**
```
LESSON: Existence, Knowledge, and Certainty

PHASE 1 - TEACH:
INDICATIVE for stating existence/certainty:
- Hay un restaurante que está abierto. (There's a restaurant that's open)
- Es verdad que llueve. (It's true that it's raining)
- Es cierto que vino. (It's certain he came)
- Es obvio que no sabe. (It's obvious he doesn't know)

SUBJUNCTIVE for denying/doubting existence:
- No hay ningún restaurante que esté abierto. (There's no restaurant that's open)
- No es verdad que llueva. (It's not true that it's raining)
- No es cierto que viniera. (It's not certain he came)

SUBJUNCTIVE for value judgments:
- Es importante que vengas. (It's important that you come)
- Es mejor que esperes. (It's better that you wait)
- Es una lástima que no puedas. (It's a shame you can't)

PHASE 2 - EXAMPLES:
5 sentences showing existence/knowledge triggers.

PHASE 3 - QUIZ (15 questions):
Choose mood based on existence/certainty expressions.
Use Castilian Spanish with vosotros.
```

---

#### 118. `learning.spanish.grammar.subj_ind_emotion_fact.v1`

**Activity:** Es + Adjective + Que - Emotion vs Fact

**Prompt:**
```
LESSON: Impersonal Expressions - Fact vs Reaction

PHASE 1 - TEACH:
INDICATIVE with expressions stating FACT:
- Es verdad que tiene razón. (It's true he's right)
- Es cierto que llegó tarde. (It's certain he arrived late)
- Es evidente que no sabe. (It's evident he doesn't know)
- Es obvio que miente. (It's obvious he's lying)

SUBJUNCTIVE with expressions of EMOTION/JUDGMENT:
- Es triste que tenga que irse. (It's sad he has to leave)
- Es bueno que estudies. (It's good that you study)
- Es importante que vengas. (It's important that you come)
- Es raro que no llame. (It's strange he doesn't call)
- Es una pena que no puedas. (It's a pity you can't)

Negating fact expressions → Subjunctive:
- No es verdad que tenga razón. (It's not true he's right)

PHASE 2 - EXAMPLES:
5 pairs contrasting fact vs emotion expressions.

PHASE 3 - QUIZ (15 questions):
Choose mood with impersonal es + adjective expressions.
Use Castilian Spanish with vosotros.
```

---

#### 119. `learning.spanish.grammar.subj_ind_comprehensive.v1`

**Activity:** Subjunctive vs Indicative - Comprehensive Review

**Prompt:**
```
LESSON: Indicative vs Subjunctive - Master Practice

PHASE 1 - TEACH:
SUBJUNCTIVE TRIGGERS (remember WEIRDO + more):
- Wishes (quiero que)
- Emotions (me alegra que)
- Impersonal judgments (es importante que)
- Recommendations (recomiendo que)
- Doubt/Denial (no creo que, dudar que)
- Ojalá
- Unknown/non-existent antecedent
- Future time clauses (cuando + future)
- Purpose clauses (para que)
- Certain conjunctions (a menos que, sin que, antes de que)

INDICATIVE TRIGGERS:
- Certainty (creo que, es verdad que)
- Known antecedent
- Past/present time clauses
- Facts (aunque + fact)

PHASE 2 - EXAMPLES:
5 challenging sentences requiring careful mood choice.

PHASE 3 - QUIZ (15 questions):
Mixed indicative/subjunctive scenarios. All trigger types.
Use Castilian Spanish with vosotros.
```

---

## 11. ADVANCED VERB FORMS (18 cards)

### Gerund & Progressive (6)

---

#### 120. `learning.spanish.grammar.progressive_estar_gerund.v1`

**Activity:** Estar + Gerund - Progressive Tenses

**Prompt:**
```
LESSON: Progressive Tenses - Estar + Gerund

PHASE 1 - TEACH:
Formation: ESTAR + GERUND
Gerund: -AR → -ando, -ER/-IR → -iendo

- Estoy hablando. (I am speaking)
- Está comiendo. (He is eating)
- Estamos viviendo aquí. (We are living here)

Works in all tenses of estar:
- Estaba trabajando. (I was working)
- Estaré esperando. (I will be waiting)
- He estado estudiando. (I have been studying)

Use for actions IN PROGRESS at that moment.
Spanish uses simple tenses more than English progressive:
- ¿Qué haces? (What are you doing?) - more common than
- ¿Qué estás haciendo?

PHASE 2 - EXAMPLES:
5 sentences with progressive in various tenses.

PHASE 3 - QUIZ (15 questions):
Form progressive tenses. Conjugate estar + gerund.
Use Castilian Spanish with vosotros.
```

---

#### 121. `learning.spanish.grammar.progressive_irregular_gerunds.v1`

**Activity:** Irregular Gerunds

**Prompt:**
```
LESSON: Irregular Gerund Forms

PHASE 1 - TEACH:
STEM-CHANGING gerunds (e→i, o→u for -IR verbs):
- decir → diciendo (saying)
- pedir → pidiendo (asking for)
- seguir → siguiendo (following)
- sentir → sintiendo (feeling)
- dormir → durmiendo (sleeping)
- morir → muriendo (dying)
- venir → viniendo (coming)
- poder → pudiendo (being able)

SPELLING changes (-iendo → -yendo after vowel):
- leer → leyendo (reading)
- oír → oyendo (hearing)
- traer → trayendo (bringing)
- caer → cayendo (falling)
- ir → yendo (going)
- construir → construyendo (building)

PHASE 2 - EXAMPLES:
5 sentences with irregular gerunds.

PHASE 3 - QUIZ (15 questions):
Form and use irregular gerunds correctly.
Use Castilian Spanish with vosotros.
```

---

#### 122. `learning.spanish.grammar.progressive_seguir_continuar.v1`

**Activity:** Seguir/Continuar + Gerund

**Prompt:**
```
LESSON: Keep Doing - Seguir/Continuar + Gerund

PHASE 1 - TEACH:
SEGUIR + gerund = to keep doing, to still be doing
- Sigo estudiando. (I keep studying / I'm still studying)
- Siguió hablando. (He kept talking)
- ¿Sigues trabajando allí? (Are you still working there?)

CONTINUAR + gerund = to continue doing
- Continúo aprendiendo. (I continue learning)
- Continuaron caminando. (They continued walking)

Both express ongoing action that persists:
- Sigue lloviendo. (It's still raining)
- Continúa nevando. (It continues snowing)

Compare with estar (simple progression vs persistence):
- Está lloviendo. (It's raining - right now)
- Sigue lloviendo. (It's still raining - emphasis on continuation)

PHASE 2 - EXAMPLES:
5 sentences with seguir/continuar + gerund.

PHASE 3 - QUIZ (15 questions):
Use seguir and continuar with gerunds.
Use Castilian Spanish with vosotros.
```

---

#### 123. `learning.spanish.grammar.progressive_llevar_gerund.v1`

**Activity:** Llevar + Time + Gerund (I've Been Doing For...)

**Prompt:**
```
LESSON: Llevar + Time + Gerund - Duration

PHASE 1 - TEACH:
LLEVAR + time + gerund = to have been doing for (duration)

- Llevo dos horas estudiando. (I've been studying for two hours)
- Llevan tres años viviendo aquí. (They've been living here for three years)
- ¿Cuánto tiempo llevas esperando? (How long have you been waiting?)

Past duration (imperfect of llevar):
- Llevaba una hora esperando cuando llegaste.
  (I had been waiting for an hour when you arrived)

Negative: Llevar + time + sin + infinitive
- Llevo dos días sin dormir. (I haven't slept for two days)
- Llevaba un mes sin verla. (I hadn't seen her for a month)

PHASE 2 - EXAMPLES:
5 sentences expressing duration with llevar.

PHASE 3 - QUIZ (15 questions):
Express duration using llevar + gerund construction.
Use Castilian Spanish with vosotros.
```

---

#### 124. `learning.spanish.grammar.progressive_ir_venir_andar.v1`

**Activity:** Ir, Venir, Andar + Gerund

**Prompt:**
```
LESSON: Movement Verbs + Gerund

PHASE 1 - TEACH:
IR + gerund = gradual development, increasing
- Va mejorando. (It's gradually getting better)
- El problema va empeorando. (The problem is getting worse)
- Voy entendiendo. (I'm starting to understand)

VENIR + gerund = action that's been happening, leading to now
- Vengo diciéndote esto hace tiempo. (I've been telling you this for a while)
- Viene trabajando aquí desde enero. (He's been working here since January)

ANDAR + gerund = continuous action (often wandering/aimless)
- Anda buscando trabajo. (He's going around looking for work)
- Andamos pensando en mudarnos. (We've been thinking about moving)

QUEDARSE + gerund = remain doing
- Se quedó mirándome. (He stayed looking at me)

PHASE 2 - EXAMPLES:
5 sentences with movement verbs + gerund.

PHASE 3 - QUIZ (15 questions):
Choose appropriate movement verb + gerund.
Use Castilian Spanish with vosotros.
```

---

#### 125. `learning.spanish.grammar.gerund_vs_infinitive.v1`

**Activity:** Gerund vs Infinitive - The English "-ing" Trap

**Prompt:**
```
LESSON: When NOT to Use Gerund (The -ing Trap)

PHASE 1 - TEACH:
English "-ing" is NOT always gerund in Spanish!

USE INFINITIVE (not gerund) for:
- Subject of sentence: Nadar es bueno. (Swimming is good) NOT "Nadando"
- After prepositions: Antes de comer. (Before eating) NOT "antes de comiendo"
- After most verbs: Quiero bailar. (I want to dance) NOT "quiero bailando"

USE GERUND for:
- Progressive: Estoy comiendo. (I'm eating)
- While/by doing: Aprendí escuchando. (I learned by listening)
- Description of action: Llegó corriendo. (He arrived running)

Common errors to avoid:
- I'm interested in learning = Me interesa aprender (NOT aprendiendo)
- Thank you for coming = Gracias por venir (NOT viniendo)
- I like swimming = Me gusta nadar (NOT nadando)

PHASE 2 - EXAMPLES:
5 sentences showing infinitive where English uses "-ing."

PHASE 3 - QUIZ (15 questions):
Choose between infinitive and gerund for "-ing" meanings.
Use Castilian Spanish with vosotros.
```

---

### Infinitive Constructions (6)

---

#### 126. `learning.spanish.grammar.infinitive_after_prepositions.v1`

**Activity:** Infinitive After Prepositions

**Prompt:**
```
LESSON: Preposition + Infinitive

PHASE 1 - TEACH:
In Spanish, infinitive follows prepositions (unlike English which uses -ing):

- antes de + infinitive: antes de salir (before leaving)
- después de + infinitive: después de comer (after eating)
- para + infinitive: para aprender (in order to learn)
- sin + infinitive: sin saber (without knowing)
- al + infinitive: al llegar (upon arriving)
- en vez de + infinitive: en vez de trabajar (instead of working)

"Al + infinitive" = when/upon doing:
- Al verlo, sonrió. (Upon seeing him, she smiled)
- Al terminar, descansé. (When I finished, I rested)

"Por + infinitive" = because of having done / for doing:
- Por llegar tarde, perdí el tren. (By arriving late, I missed the train)

PHASE 2 - EXAMPLES:
5 sentences with different preposition + infinitive combinations.

PHASE 3 - QUIZ (15 questions):
Use infinitive after prepositions. Translate from English "-ing."
Use Castilian Spanish with vosotros.
```

---

#### 127. `learning.spanish.grammar.infinitive_verb_chains.v1`

**Activity:** Verb + Infinitive Combinations

**Prompt:**
```
LESSON: Modal and Semi-Modal Verbs + Infinitive

PHASE 1 - TEACH:
Many verbs directly take infinitive (no preposition):

MODAL-like:
- poder + inf: Puedo nadar. (I can swim)
- deber + inf: Debes estudiar. (You should study)
- querer + inf: Quiero ir. (I want to go)
- saber + inf: Sé cocinar. (I know how to cook)
- soler + inf: Suelo correr. (I usually run)

Other common verb + infinitive:
- necesitar: Necesito descansar. (I need to rest)
- preferir: Prefiero quedarme. (I prefer to stay)
- pensar: Pienso viajar. (I'm planning to travel)
- esperar: Espero verte. (I hope to see you)
- decidir: Decidí salir. (I decided to leave)
- intentar: Intenté abrir. (I tried to open)

PHASE 2 - EXAMPLES:
5 sentences with verb + infinitive chains.

PHASE 3 - QUIZ (15 questions):
Form sentences with verb + infinitive combinations.
Use Castilian Spanish with vosotros.
```

---

#### 128. `learning.spanish.grammar.infinitive_perception.v1`

**Activity:** Perception Verbs + Infinitive/Gerund

**Prompt:**
```
LESSON: Ver, Oír, Sentir + Infinitive or Gerund

PHASE 1 - TEACH:
Perception verbs can take infinitive OR gerund with slight difference:

WITH INFINITIVE (complete action):
- Vi llegar el tren. (I saw the train arrive)
- Oí cantar a María. (I heard María sing)
- Sentí temblar el suelo. (I felt the ground shake)

WITH GERUND (action in progress):
- Vi al tren llegando. (I saw the train arriving)
- Oí a María cantando. (I heard María singing)
- Sentí el suelo temblando. (I felt the ground shaking)

Infinitive = the whole event
Gerund = the action as it was happening

Also works with: mirar, observar, escuchar, notar
- Lo vi salir. (I saw him leave)
- Lo vi saliendo. (I saw him leaving)

PHASE 2 - EXAMPLES:
5 pairs showing infinitive vs gerund with perception verbs.

PHASE 3 - QUIZ (15 questions):
Use perception verbs with infinitive and gerund.
Use Castilian Spanish with vosotros.
```

---

#### 129. `learning.spanish.grammar.infinitive_causative.v1`

**Activity:** Hacer, Dejar, Mandar + Infinitive (Causative)

**Prompt:**
```
LESSON: Causative Constructions

PHASE 1 - TEACH:
These verbs + infinitive = make/let/have someone do something:

HACER + infinitive = to make/have someone do
- Me hizo reír. (He made me laugh)
- Hizo reparar el coche. (He had the car repaired)
- La película me hizo llorar. (The movie made me cry)

DEJAR + infinitive = to let/allow
- No me deja salir. (He doesn't let me go out)
- Déjame pensar. (Let me think)
- Los dejó entrar. (He let them enter)

MANDAR + infinitive = to order/have done
- Mandó construir una casa. (He had a house built)
- Me mandó callar. (He ordered me to be quiet)

Word order with pronouns:
- Me hizo reír. = Hizo reírme. (Both correct)

PHASE 2 - EXAMPLES:
5 sentences with causative constructions.

PHASE 3 - QUIZ (15 questions):
Form causative sentences with hacer, dejar, mandar.
Use Castilian Spanish with vosotros.
```

---

#### 130. `learning.spanish.grammar.infinitive_as_noun.v1`

**Activity:** Infinitive as Noun (El + Infinitive)

**Prompt:**
```
LESSON: Nominalized Infinitive - El + Infinitive

PHASE 1 - TEACH:
Infinitives can function as nouns (always masculine):

EL + infinitive = the act of doing:
- El saber no ocupa lugar. (Knowledge takes up no space)
- Me gusta el cantar de los pájaros. (I like the singing of birds)
- El comer bien es importante. (Eating well is important)

As subject of sentence:
- Fumar es malo. (Smoking is bad)
- Trabajar demasiado cansa. (Working too much is tiring)
- Viajar me encanta. (I love traveling)

After ser:
- Lo importante es participar. (The important thing is to participate)
- Querer es poder. (To want is to be able / Where there's a will...)

With al (= when):
- Al amanecer, salimos. (At dawn, we left)

PHASE 2 - EXAMPLES:
5 sentences with infinitive used as noun.

PHASE 3 - QUIZ (15 questions):
Use infinitives as nouns and subjects.
Use Castilian Spanish with vosotros.
```

---

#### 131. `learning.spanish.grammar.infinitive_vs_subjunctive.v1`

**Activity:** Infinitive vs Subjunctive - Same or Different Subject

**Prompt:**
```
LESSON: When to Use Infinitive vs Subjunctive

PHASE 1 - TEACH:
SAME SUBJECT = use INFINITIVE
- Quiero ir. (I want to go) - I want, I go
- Espero terminar. (I hope to finish) - I hope, I finish
- Prefiero quedarme. (I prefer to stay) - I prefer, I stay

DIFFERENT SUBJECTS = use QUE + SUBJUNCTIVE
- Quiero que vayas. (I want you to go) - I want, you go
- Espero que termines. (I hope you finish) - I hope, you finish
- Prefiero que te quedes. (I prefer you to stay) - I prefer, you stay

Common pattern verbs:
- querer, preferir, desear, esperar
- necesitar, intentar
- alegrarse de, sentir
- tener miedo de

Note: Some always take subjunctive regardless:
- Es importante estudiar. (general)
- Es importante que estudies. (specific person)

PHASE 2 - EXAMPLES:
5 pairs showing same-subject (infinitive) vs different-subject (subjunctive).

PHASE 3 - QUIZ (15 questions):
Choose between infinitive and que + subjunctive.
Use Castilian Spanish with vosotros.
```

---

### Participle Uses (6)

---

#### 132. `learning.spanish.grammar.participle_formation.v1`

**Activity:** Past Participle Formation - Regular and Irregular

**Prompt:**
```
LESSON: Past Participle Formation

PHASE 1 - TEACH:
REGULAR formation:
- -AR verbs → -ado: hablar → hablado
- -ER/-IR verbs → -ido: comer → comido, vivir → vivido

Accent on -ído after vowel:
- leer → leído, oír → oído, traer → traído, caer → caído

IRREGULAR participles (memorize!):
- abrir → abierto
- cubrir → cubierto
- decir → dicho
- escribir → escrito
- hacer → hecho
- morir → muerto
- poner → puesto
- resolver → resuelto
- romper → roto
- ver → visto
- volver → vuelto

Compounds follow same pattern: describir → descrito, devolver → devuelto

PHASE 2 - EXAMPLES:
5 sentences using various participles.

PHASE 3 - QUIZ (15 questions):
Form regular and irregular participles.
Use Castilian Spanish with vosotros.
```

---

#### 133. `learning.spanish.grammar.participle_adjective.v1`

**Activity:** Participle as Adjective (Agreement Rules)

**Prompt:**
```
LESSON: Participle as Adjective

PHASE 1 - TEACH:
When participle is used as ADJECTIVE, it agrees in gender and number:

- La puerta está abierta. (The door is open)
- Los libros están escritos en español. (The books are written in Spanish)
- Las ventanas están cerradas. (The windows are closed)
- El trabajo está terminado. (The work is finished)

Compare with compound tenses (NO agreement):
- He abierto la puerta. (invariable)
- La puerta está abierta. (agrees)
- Hemos escrito las cartas. (invariable)
- Las cartas están escritas. (agrees)

Common adjective participles:
- cansado/a, aburrido/a, preocupado/a, enamorado/a
- sentado/a, acostado/a, dormido/a

PHASE 2 - EXAMPLES:
5 sentences with participle as adjective (showing agreement).

PHASE 3 - QUIZ (15 questions):
Use participles as adjectives with correct agreement.
Use Castilian Spanish with vosotros.
```

---

#### 134. `learning.spanish.grammar.participle_absolute.v1`

**Activity:** Absolute Participle Constructions

**Prompt:**
```
LESSON: Absolute Participle Constructions

PHASE 1 - TEACH:
Participle can introduce a clause (like "having done" or "once done"):

PARTICIPLE + NOUN = once [noun] is [participle]:
- Terminada la clase, salimos. (Once the class was over, we left)
- Dicho esto, se fue. (Having said this, he left)
- Leído el libro, lo devolví. (Having read the book, I returned it)
- Cerradas las puertas, empezó la película. (With the doors closed...)

Participle AGREES with the noun:
- Terminados los exámenes... (Once the exams were finished...)
- Hechos los deberes... (Once the homework was done...)

This is formal/literary but important to recognize and use occasionally:
- Una vez terminado el trabajo... (Once the work was finished...)
- Visto lo visto... (Given what we've seen...)

PHASE 2 - EXAMPLES:
5 sentences with absolute participle constructions.

PHASE 3 - QUIZ (15 questions):
Form and interpret absolute participle clauses.
Use Castilian Spanish with vosotros.
```

---

#### 135. `learning.spanish.grammar.participle_passive_estar.v1`

**Activity:** Estar + Participle vs Ser + Participle

**Prompt:**
```
LESSON: Resultant State (Estar) vs Passive Action (Ser)

PHASE 1 - TEACH:
ESTAR + participle = RESULT/STATE (what something is like now):
- La puerta está cerrada. (The door is closed - current state)
- El libro está escrito en español. (The book is written in Spanish)
- Estoy cansado. (I'm tired)

SER + participle = PASSIVE ACTION (something being done):
- La puerta fue cerrada por el guardia. (The door was closed by the guard)
- El libro fue escrito por Cervantes. (The book was written by Cervantes)

Key difference:
- SER = action happening (often with agent "por")
- ESTAR = resulting condition (no agent)

Examples:
- La casa FUE construida en 1990. (action - when it was built)
- La casa ESTÁ construida de madera. (state - what it's made of)

PHASE 2 - EXAMPLES:
5 pairs contrasting ser and estar with participles.

PHASE 3 - QUIZ (15 questions):
Choose ser or estar with participles based on action vs state.
Use Castilian Spanish with vosotros.
```

---

#### 136. `learning.spanish.grammar.participle_compound_tenses.v1`

**Activity:** Participle in Compound Tenses (No Agreement)

**Prompt:**
```
LESSON: Haber + Participle - No Gender/Number Agreement

PHASE 1 - TEACH:
In compound tenses (with haber), participle NEVER changes:

- He comido. (I have eaten) - same for male/female
- Ella ha salido. (She has left) - NOT "ha salida"
- Hemos visto las películas. (We have seen the films) - NOT "hemos vistas"
- Han escrito las cartas. (They have written the letters) - NOT "escritas"

This differs from other Romance languages!

All compound tenses:
- Present perfect: He terminado
- Pluperfect: Había terminado
- Future perfect: Habré terminado
- Conditional perfect: Habría terminado
- Perfect subjunctive: Haya terminado
- Pluperfect subjunctive: Hubiera terminado

In ALL these: participle stays -ado/-ido form, never agrees.

PHASE 2 - EXAMPLES:
5 compound tense sentences (no participle agreement).

PHASE 3 - QUIZ (15 questions):
Form compound tenses with invariable participle.
Use Castilian Spanish with vosotros.
```

---

#### 137. `learning.spanish.grammar.verb_forms_comprehensive.v1`

**Activity:** Gerund, Infinitive, Participle - Comprehensive Review

**Prompt:**
```
LESSON: Non-Finite Verb Forms Review

PHASE 1 - TEACH:
Three non-finite forms in Spanish:

INFINITIVE (-ar, -er, -ir):
- As noun: Fumar es malo.
- After prepositions: antes de salir
- After certain verbs: Quiero ir.
- Same-subject constructions: Espero terminar.

GERUND (-ando, -iendo):
- Progressive: Estoy comiendo.
- Manner/while: Llegó corriendo.
- With seguir/llevar: Sigo trabajando.
- NOT as noun, NOT after prepositions!

PARTICIPLE (-ado, -ido):
- Compound tenses (no agreement): He comido.
- As adjective (with agreement): La puerta cerrada.
- Absolute constructions: Terminada la clase...
- With ser (passive): Fue escrito por...
- With estar (state): Está cerrado.

PHASE 2 - EXAMPLES:
5 sentences mixing all three non-finite forms.

PHASE 3 - QUIZ (15 questions):
Choose and form correct non-finite form for context.
Use Castilian Spanish with vosotros.
```

---

## 12. EXPRESSIONS & IDIOMS (13 cards)

### Verbal Periphrases (5)

---

#### 138. `learning.spanish.grammar.periphrasis_ir_a.v1`

**Activity:** Ir a + Infinitive (Near Future)

**Prompt:**
```
LESSON: Ir a + Infinitive - The Near Future

PHASE 1 - TEACH:
IR A + infinitive = going to (do something)

Present tense of ir + a + infinitive:
- Voy a comer. (I'm going to eat)
- ¿Vas a venir? (Are you going to come?)
- Va a llover. (It's going to rain)
- Vamos a ver. (Let's see / We're going to see)

Very common in speech, often preferred over future tense:
- Mañana voy a trabajar. = Mañana trabajaré.

Past (iba a = was going to):
- Iba a llamarte, pero no tuve tiempo. (I was going to call you, but...)

With pronouns:
- Voy a hacerlo. / Lo voy a hacer. (I'm going to do it)

PHASE 2 - EXAMPLES:
5 sentences with ir a + infinitive in various contexts.

PHASE 3 - QUIZ (15 questions):
Use ir a construction for immediate future.
Use Castilian Spanish with vosotros.
```

---

#### 139. `learning.spanish.grammar.periphrasis_acabar_de.v1`

**Activity:** Acabar de + Infinitive (Just Did)

**Prompt:**
```
LESSON: Acabar de + Infinitive - To Have Just Done

PHASE 1 - TEACH:
ACABAR DE + infinitive = to have just (done something)

Present tense (just now):
- Acabo de llegar. (I have just arrived)
- Acaba de salir. (He has just left)
- Acabamos de comer. (We have just eaten)

Imperfect (had just - in past):
- Acababa de llegar cuando sonó el teléfono.
  (I had just arrived when the phone rang)
- Acababan de irse cuando llegué.
  (They had just left when I arrived)

Note: In English "just" with perfect, in Spanish present/imperfect + acabar de:
- I've just seen him = Acabo de verlo
- I had just seen him = Acababa de verlo

PHASE 2 - EXAMPLES:
5 sentences with acabar de (present and imperfect).

PHASE 3 - QUIZ (15 questions):
Express "just did" with acabar de in correct tense.
Use Castilian Spanish with vosotros.
```

---

#### 140. `learning.spanish.grammar.periphrasis_volver_a.v1`

**Activity:** Volver a + Infinitive (To Do Again)

**Prompt:**
```
LESSON: Volver a + Infinitive - To Do Again

PHASE 1 - TEACH:
VOLVER A + infinitive = to do (something) again

- Vuelvo a intentarlo. (I'm trying again)
- Volvió a llamar. (He called again)
- No vuelvas a hacer eso. (Don't do that again)
- Ha vuelto a nevar. (It has snowed again)

More emphatic than "otra vez":
- Lo hizo otra vez. = Volvió a hacerlo. (He did it again)

Negative command (don't do again):
- ¡No lo vuelvas a hacer! (Don't do it again!)
- No volveré a cometer ese error. (I won't make that mistake again)

Can combine with other periphrases:
- Voy a volver a intentarlo. (I'm going to try again)

PHASE 2 - EXAMPLES:
5 sentences with volver a + infinitive.

PHASE 3 - QUIZ (15 questions):
Express repetition with volver a.
Use Castilian Spanish with vosotros.
```

---

#### 141. `learning.spanish.grammar.periphrasis_ponerse_dejar.v1`

**Activity:** Ponerse a, Dejar de, Echarse a

**Prompt:**
```
LESSON: Beginning and Stopping Actions

PHASE 1 - TEACH:
STARTING actions:
- Ponerse a + inf = to start (suddenly/deliberately)
  Se puso a llorar. (She started to cry)
  Me puse a trabajar. (I started working)

- Echarse a + inf = to burst into (sudden, emotional)
  Se echó a reír. (He burst out laughing)
  Se echaron a correr. (They broke into a run)

- Empezar/Comenzar a + inf = to begin (neutral)
  Empezó a llover. (It started to rain)

STOPPING actions:
- Dejar de + inf = to stop doing
  Dejó de fumar. (He stopped smoking)
  No dejo de pensar en ti. (I can't stop thinking about you)

- Parar de + inf = to stop (temporarily)
  Ha parado de llover. (It has stopped raining)

PHASE 2 - EXAMPLES:
5 sentences with start/stop periphrases.

PHASE 3 - QUIZ (15 questions):
Use appropriate periphrasis for beginning/stopping.
Use Castilian Spanish with vosotros.
```

---

#### 142. `learning.spanish.grammar.periphrasis_tener_hay_deber.v1`

**Activity:** Tener que, Hay que, Deber - Obligation

**Prompt:**
```
LESSON: Expressing Obligation

PHASE 1 - TEACH:
TENER QUE + inf = have to (personal obligation)
- Tengo que estudiar. (I have to study)
- Tuvimos que salir. (We had to leave)
- Tendrás que decidir. (You'll have to decide)

HAY QUE + inf = one has to (impersonal, general)
- Hay que trabajar para vivir. (One has to work to live)
- Hay que tener cuidado. (One must be careful)
- Había que hacerlo. (It had to be done)

DEBER + inf = should/ought to (moral obligation)
- Debes estudiar más. (You should study more)
- Debería llamarla. (I should call her)
- Debemos ayudar. (We ought to help)

DEBER DE + inf = must (probability) - different meaning!
- Debe de estar enfermo. (He must be sick - probably)
- Deben de ser las 3. (It must be about 3)

PHASE 2 - EXAMPLES:
5 sentences with different obligation expressions.

PHASE 3 - QUIZ (15 questions):
Choose correct obligation expression for context.
Use Castilian Spanish with vosotros.
```

---

### Useful B1/B2 Expressions (5)

---

#### 143. `learning.spanish.grammar.expressions_hace_desde.v1`

**Activity:** Hace + Time / Desde hace

**Prompt:**
```
LESSON: Time Expressions - Hace, Desde, Desde hace

PHASE 1 - TEACH:
HACE + time = ago (past action)
- Llegué hace dos horas. (I arrived two hours ago)
- Lo vi hace una semana. (I saw him a week ago)

HACE + time + QUE + present = for (ongoing action)
- Hace dos años que vivo aquí. (I've been living here for two years)
- Hace tiempo que no te veo. (I haven't seen you for a while)

DESDE HACE + time = for (duration until now)
- Estudio español desde hace tres años. (I've been studying Spanish for 3 years)
- Trabaja aquí desde hace un mes. (He's been working here for a month)

DESDE + point in time = since
- Vivo aquí desde 2020. (I've lived here since 2020)
- Desde el lunes estoy enfermo. (I've been sick since Monday)

PHASE 2 - EXAMPLES:
5 sentences with hace and desde constructions.

PHASE 3 - QUIZ (15 questions):
Use hace, desde, desde hace correctly.
Use Castilian Spanish with vosotros.
```

---

#### 144. `learning.spanish.grammar.expressions_soler.v1`

**Activity:** Soler + Infinitive (To Usually Do)

**Prompt:**
```
LESSON: Soler - Expressing Habits

PHASE 1 - TEACH:
SOLER + infinitive = to usually/tend to (do something)

Present (current habits):
- Suelo levantarme temprano. (I usually get up early)
- ¿Sueles venir aquí? (Do you usually come here?)
- Solemos cenar a las 9. (We usually have dinner at 9)

Imperfect (past habits):
- Solía ir al cine los viernes. (I used to go to the movies on Fridays)
- Solíamos vernos cada semana. (We used to see each other every week)
- De niño, solía jugar aquí. (As a child, I used to play here)

ONLY used in present and imperfect (not other tenses)
- NOT: *He solido, *Soleré

Soler = habitual action
- Suelo correr por las mañanas. (I usually run in the mornings)

PHASE 2 - EXAMPLES:
5 sentences with soler (present and imperfect).

PHASE 3 - QUIZ (15 questions):
Express habits with soler in correct tense.
Use Castilian Spanish with vosotros.
```

---

#### 145. `learning.spanish.grammar.expressions_lo_adjective.v1`

**Activity:** Lo + Adjective (The ... Thing)

**Prompt:**
```
LESSON: Lo + Adjective - Abstract Concepts

PHASE 1 - TEACH:
LO + adjective = the (adjective) thing/part/aspect

- Lo importante es participar. (The important thing is to participate)
- Lo bueno de vivir aquí... (The good thing about living here...)
- Lo malo es que no tengo tiempo. (The bad thing is I don't have time)
- Lo mejor fue el final. (The best part was the end)
- Lo peor ya pasó. (The worst is over)

With de:
- Lo interesante del libro... (The interesting thing about the book...)
- Lo difícil de este trabajo... (The difficult part of this job...)

With que:
- Lo que dices es verdad. (What you say is true)
- Haz lo que quieras. (Do what you want)

Lo + adjective + que = how (adjective):
- No sabes lo difícil que es. (You don't know how difficult it is)

PHASE 2 - EXAMPLES:
5 sentences with lo + adjective constructions.

PHASE 3 - QUIZ (15 questions):
Use lo + adjective for abstract concepts.
Use Castilian Spanish with vosotros.
```

---

#### 146. `learning.spanish.grammar.expressions_comparatives.v1`

**Activity:** Comparatives and Superlatives

**Prompt:**
```
LESSON: Comparisons - More/Less/Most/Least

PHASE 1 - TEACH:
COMPARATIVES:
- más + adj + que = more ... than
  Es más alto que yo. (He's taller than me)
- menos + adj + que = less ... than
  Es menos caro que el otro. (It's less expensive than the other)
- tan + adj + como = as ... as
  Es tan inteligente como tú. (He's as smart as you)

SUPERLATIVES:
- el/la más + adj = the most
  Es el más alto de la clase. (He's the tallest in the class)
- el/la menos + adj = the least
  Es la menos cara. (It's the least expensive)

IRREGULAR forms:
- bueno → mejor (better) → el mejor (the best)
- malo → peor (worse) → el peor (the worst)
- grande → mayor (older/bigger) → el mayor
- pequeño → menor (younger/smaller) → el menor

PHASE 2 - EXAMPLES:
5 sentences with various comparison structures.

PHASE 3 - QUIZ (15 questions):
Form comparatives and superlatives correctly.
Use Castilian Spanish with vosotros.
```

---

#### 147. `learning.spanish.grammar.expressions_connectors.v1`

**Activity:** Advanced Connectors

**Prompt:**
```
LESSON: Connectors for Complex Arguments

PHASE 1 - TEACH:
CONTRAST:
- sin embargo (however)
- no obstante (nevertheless)
- aunque (although)
- a pesar de (que) (despite, in spite of)
- en cambio (on the other hand)

CAUSE/RESULT:
- por lo tanto (therefore)
- por consiguiente (consequently)
- así que (so)
- de ahí que + subjunctive (hence)
- dado que (given that)

ADDITION:
- además (moreover, besides)
- asimismo (likewise)
- incluso (even)
- es más (what's more)

SEQUENCE:
- en primer lugar (firstly)
- por un lado... por otro (on one hand... on the other)
- finalmente (finally)
- en conclusión (in conclusion)

PHASE 2 - EXAMPLES:
5 sentences using advanced connectors.

PHASE 3 - QUIZ (15 questions):
Use connectors to link ideas appropriately.
Use Castilian Spanish with vosotros.
```

---

### Expression Review (3)

---

#### 148. `learning.spanish.grammar.expressions_subjunctive_fixed.v1`

**Activity:** Fixed Subjunctive Expressions

**Prompt:**
```
LESSON: Common Fixed Subjunctive Phrases

PHASE 1 - TEACH:
Memorize these expressions (always subjunctive):

WISHES:
- Ojalá (que) + subjunctive (I hope, if only)
- Que tengas buen viaje. (Have a good trip)
- Que te mejores. (Get well soon)
- Que lo pases bien. (Have a good time)
- Que aproveche. (Enjoy your meal)

CONCESSIONS:
- Sea como sea (be that as it may)
- Pase lo que pase (whatever happens)
- Cueste lo que cueste (whatever it costs)
- Digan lo que digan (whatever they say)

KNOWLEDGE HEDGES:
- Que yo sepa (as far as I know)
- Que yo recuerde (as far as I remember)
- Por lo que yo sé (from what I know)

POLITE:
- Si no le importa que... (If you don't mind...)
- Si me permite que... (If you'll allow me to...)

PHASE 2 - EXAMPLES:
5 sentences with fixed subjunctive expressions.

PHASE 3 - QUIZ (15 questions):
Use fixed subjunctive expressions correctly.
Use Castilian Spanish with vosotros.
```

---

#### 149. `learning.spanish.grammar.expressions_idioms.v1`

**Activity:** Common Idiomatic Expressions

**Prompt:**
```
LESSON: Useful Idiomatic Expressions

PHASE 1 - TEACH:
TIME-RELATED:
- de vez en cuando (from time to time)
- cada vez más/menos (more and more / less and less)
- a la larga (in the long run)
- a última hora (at the last minute)
- en un abrir y cerrar de ojos (in the blink of an eye)

QUANTITY:
- más o menos (more or less)
- poco a poco (little by little)
- sobre todo (above all, especially)
- al fin y al cabo (after all, at the end of the day)

OPINION/ATTITUDE:
- desde mi punto de vista (from my point of view)
- en mi opinión (in my opinion)
- a decir verdad (to tell the truth)
- por lo visto (apparently)
- que yo sepa (as far as I know)

PHASE 2 - EXAMPLES:
5 sentences using idiomatic expressions naturally.

PHASE 3 - QUIZ (15 questions):
Complete sentences with appropriate idioms.
Use Castilian Spanish with vosotros.
```

---

#### 150. `learning.spanish.grammar.expressions_comprehensive.v1`

**Activity:** B1/B2 Expressions - Comprehensive Review

**Prompt:**
```
LESSON: Comprehensive Expression Review

PHASE 1 - TEACH:
Quick review of key B1/B2 expressions:

PERIPHRASES:
- ir a + inf (going to)
- acabar de + inf (just did)
- volver a + inf (do again)
- dejar de + inf (stop doing)
- tener que / hay que / deber (obligation)
- soler + inf (usually do)

TIME:
- hace + time (ago)
- desde hace (for)
- desde (since)

STRUCTURES:
- lo + adjective (the ... thing)
- cuanto más... más (the more... the more)
- cada vez más/menos (increasingly)

CONNECTORS:
- sin embargo, no obstante (however)
- por lo tanto, así que (therefore)
- además, incluso (moreover, even)

PHASE 2 - EXAMPLES:
5 complex sentences combining multiple expressions.

PHASE 3 - QUIZ (15 questions):
Mixed expression practice covering all topics.
Use Castilian Spanish with vosotros.
```

---

# Summary

| Topic | Cards |
|-------|-------|
| 1. Subjunctive Mood | 15 |
| 2. Conditional Mood | 27 |
| 3. Perfect Tenses | 15 |
| 4. Imperative/Commands | 12 |
| 5. Ser vs Estar | 8 |
| 6. Preterite vs Imperfect | 8 |
| 7. Por vs Para | 6 |
| 8. Pronouns | 12 |
| 9. Passive Voice & Impersonal Se | 6 |
| 10. Subjunctive vs Indicative | 10 |
| 11. Advanced Verb Forms | 18 |
| 12. Expressions & Idioms | 13 |
| **TOTAL** | **150** |
