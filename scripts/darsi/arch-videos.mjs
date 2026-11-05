// Writes the university architecture storyboards (except AI-D1-1, already voiced) and the chapter labels in the Darsi units.
//   node scripts/darsi/arch-videos.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DARSI = join(ROOT, "..", "darsi");
const ICONS = new Set("target warning calculator arrow spark layers cpu check eye pencil file users gauge repeat presentation map help shield lock bot data chip phone key".split(" "));

const pair = (en, ar) => ({ en, ar });

function scene(n, beat, voice, screen, en, ar, icons, design) {
  if (en.length !== ar.length) throw new Error(`scene ${n}: ${en.length} English sentences, ${ar.length} Arabic`);
  return { n, beat, voice, screen, en, ar, icons, design };
}

function check(prompt, options, ok, bad, arPrompt, arOptions, arOk, arBad) {
  return { prompt, options, ok, bad, arPrompt, arOptions, arOk, arBad };
}

/** Twelve scenes. `teach` replaces scenes for the lecturer cut (1, 2, 9, 12). */
function lesson(spec) {
  return spec;
}

const L = [];

L.push(lesson({
  n: 2, title: ["Loss, descent and backprop", "الخسارة والنزول والانتشار العكسي"], sub: ["The valley and the step", "الوادي والخطوة"],
  chapters: [["The valley", "الوادي"], ["The slope", "الميل"], ["One step", "خطوة واحدة"], ["Remember", "تذكّر"]],
  checks: [
    check("The loss is theta squared, theta is three, and the rate is a tenth. Where is theta after one step?",
      [["2.4", true], ["2.7", false], ["3.6", false]],
      "Correct: the slope is six, so a tenth of six leaves theta at two point four.",
      "Not quite: the slope of theta squared is two theta, which is six, so theta becomes two point four.",
      "الخسارة ثيتا تربيع، وثيتا تلاتة، والمعدّل واحد من عشرة. ثيتا بعد خطوة كام؟",
      ["اتنين علامة أربعة", "اتنين علامة سبعة", "تلاتة علامة ستة"],
      "صح: الميل ستة، وعُشر الستة يخلّي ثيتا اتنين علامة أربعة.",
      "لأ: ميل ثيتا تربيع هو اتنين في ثيتا، يعني ستة، فتبقى ثيتا اتنين علامة أربعة."),
    check("The loss grows on every step. What is the most likely cause?",
      [["The step is too big", true], ["The data is a ring", false], ["The activation is missing", false]],
      "Correct: a step that is too big climbs out of the valley and the loss grows.",
      "Not quite: a loss that grows each step is a step that is too big.",
      "الخسارة بتكبر كل خطوة. السبب الأرجح إيه؟",
      ["الخطوة كبيرة زيادة", "البيانات حلقة", "التنشيط مش موجود"],
      "صح: الخطوة الكبيرة بتطلع بره الوادي والخسارة بتكبر.",
      "لأ: خسارة بتكبر كل خطوة معناها إن الخطوة كبيرة زيادة."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["A ball in a valley", "كرة في وادي"],
      ["A ball sits high on a valley.", "One step can walk it down, or throw it out the other side."],
      ["كرة واقفة فوق في وادي.", "خطوة واحدة ممكن تنزّلها، أو ترميها بره الناحية التانية."],
      ["gauge", "warning"]),
    scene(2, "Title", "Narrator", ["Loss and the step", "الخسارة والخطوة"],
      ["Today: loss, the gradient, and why a step that is too big climbs out of the valley."],
      ["النهارده: الخسارة، والتدرّج، وليه الخطوة الكبيرة زيادة بتطلع بره الوادي."]),
    scene(3, "Definition", "Narrator", ["A number for wrong", "رقم للغلط"],
      ["The loss is a number that is large when the answer is wrong.", "Learning picks weights that make that number small."],
      ["الخسارة رقم بيكبر لما الإجابة تبقى غلط.", "والتعلّم بيختار أوزان تخلّي الرقم ده صغير."],
      ["calculator", "target", "arrow"], "cards"),
    scene(4, "Concept", "Narrator", ["Uphill, then down", "لفوق، وبعدين لتحت"],
      ["The gradient points uphill, locally.", "Descent steps the other way, against it."],
      ["التدرّج بيشاور لفوق، محليًا.", "والنزول يخطو في الاتجاه التاني، عكسه."],
      ["arrow", "gauge"], "list"),
    scene(5, "Concept", "Narrator", ["One worked step", "خطوة محسوبة"],
      ["For the loss theta squared, the slope is two theta.", "At three, with a rate of a tenth, the next value is two point four."],
      ["للخسارة ثيتا تربيع، الميل اتنين في ثيتا.", "عند تلاتة، وبمعدّل واحد من عشرة، القيمة الجاية اتنين علامة أربعة."],
      ["calculator", "check"], "list"),
    scene(6, "Examples", "Narrator", ["Watch the ball", "شوف الكرة"],
      ["Here the ball takes steps down theta squared.", "A small rate crawls, and a rate that is too big climbs out."],
      ["هنا الكرة بتاخد خطوات على ثيتا تربيع.", "المعدّل الصغير بيزحف، والمعدّل الكبير زيادة بيطلع بره."],
      ["gauge"], "descent"),
    scene(7, "Checkpoint ◆", "Joseph", ["After one step", "بعد خطوة"],
      ["Quick check!", "The loss is theta squared, theta is three, and the rate is a tenth. Where is theta after one step?"],
      ["سؤال سريع!", "الخسارة ثيتا تربيع، وثيتا تلاتة، والمعدّل واحد من عشرة. ثيتا بعد خطوة كام؟"]),
    scene(8, "Reveal", "Narrator", ["Two point four", "اتنين علامة أربعة"],
      ["At two point four.", "The slope is six, and a tenth of six stays inside the valley."],
      ["عند اتنين علامة أربعة.", "الميل ستة، وعُشر الستة بيفضل جوه الوادي."],
      ["check", "gauge"], "list"),
    scene(9, "Lab preview", "Narrator", ["The gradient lab", "معمل التدرّج"],
      ["In the app, open the gradient lab.", "Run a good step, then a step that is too big, and watch the ball."],
      ["في التطبيق، افتح معمل التدرّج.", "شغّل خطوة كويسة، وبعدين خطوة كبيرة زيادة، وشوف الكرة."],
      ["gauge", "eye", "warning"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["Why it grows", "ليه بتكبر"],
      ["Your turn.", "The loss grows on every step. What is the most likely cause?"],
      ["دورك.", "الخسارة بتكبر كل خطوة. السبب الأرجح إيه؟"]),
    scene(11, "Recap", "Narrator", ["Slope and step", "الميل والخطوة"],
      ["Remember this.", "The gradient points uphill, and the size of the step decides whether you stay in the valley."],
      ["افتكر كده.", "التدرّج بيشاور لفوق، وحجم الخطوة هو اللي يقرر هتفضل جوه الوادي ولا لأ."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["Write two point four", "اكتب اتنين علامة أربعة"],
      ["Try it on paper tonight.", "Take the step from three, at a rate of a tenth, and write two point four."],
      ["جرّبها على الورق الليلة.", "خد الخطوة من تلاتة، بمعدّل واحد من عشرة، واكتب اتنين علامة أربعة."],
      ["pencil", "calculator"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Students think the gradient points at the minimum.", "It points uphill, and a step that is too big climbs out."],
      ["الطلاب فاكرين إن التدرّج بيشاور على القاع.", "هو بيشاور لفوق، والخطوة الكبيرة زيادة بتطلع بره."]),
    2: pairScene(
      ["In the seminar: loss, the gradient, and the step your students will get wrong."],
      ["في الحلقة: الخسارة، والتدرّج، والخطوة اللي طلابك هيغلطوا فيها."]),
    9: pairScene(
      ["Have each pair predict which rate climbs out, then open the gradient lab.", "Collect one wrong prediction and why it was tempting."],
      ["خلّي كل اتنين يتوقعوا أي معدّل هيطلع بره، وبعدين افتح معمل التدرّج.", "اجمع توقع غلط واحد، وليه كان مغري."]),
    12: pairScene(
      ["Try it in your next lecture.", "Three rates, five steps by hand, before anyone opens the lab."],
      ["جرّبها في محاضرتك الجاية.", "تلات معدّلات، وخمس خطوات باليد، قبل ما حد يفتح المعمل."]),
  },
}));

function pairScene(en, ar) { return { en, ar }; }

L.push(lesson({
  n: 3, title: ["Sequences and the memory that fades", "المتسلسلات والذاكرة التي تخبو"], sub: ["One symbol at a time", "رمز واحد في كل مرة"],
  chapters: [["The cue", "الإشارة"], ["The state", "الحالة"], ["The fade", "الخبو"], ["Remember", "تذكّر"]],
  checks: [
    check("Three empty steps follow a cue, and the memory is near zero. What is left at the end?",
      [["Almost none of the cue", true], ["The whole cue", false], ["A new cue the net invented", false]],
      "Correct: a small memory, multiplied at every empty step, washes the cue away.",
      "Not quite: near zero, almost none of the cue is left.",
      "تلات خطوات فاضية بعد الإشارة، والذاكرة قرب الصفر. إيه اللي فاضل في الآخر؟",
      ["تقريبًا ولا حاجة من الإشارة", "الإشارة كلها", "إشارة جديدة الشبكة اخترعتها"],
      "صح: ذاكرة صغيرة، تتضرب في كل خطوة فاضية، بتمسح الإشارة.",
      "لأ: قرب الصفر، تقريبًا ولا حاجة من الإشارة بتفضل."),
    check("Does a recurrent net read the whole sequence in one look?",
      [["No, one symbol at a time", true], ["Yes, all at once", false], ["Only the last symbol", false]],
      "Correct: it reads one symbol at a time and hopes the hidden state kept the rest.",
      "Not quite: it never sees the whole sequence at once.",
      "الشبكة التكرارية بتقرا المتسلسلة كلها بنظرة واحدة؟",
      ["لأ، رمز واحد في كل مرة", "أيوه، كلها مرة واحدة", "الرمز الأخير بس"],
      "صح: بتقرا رمز واحد في كل مرة، وتأمل إن الحالة المخفية حفظت الباقي.",
      "لأ: عمرها ما بتشوف المتسلسلة كلها مرة واحدة."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["A cue, then silence", "إشارة، وبعدين سكوت"],
      ["The first symbol is a cue, and then the line goes quiet.", "A weak memory forgets that cue before the end."],
      ["الرمز الأول إشارة، وبعدين السطر بيسكت.", "الذاكرة الضعيفة بتنسى الإشارة دي قبل الآخر."],
      ["target", "warning"]),
    scene(2, "Title", "Narrator", ["A memory that fades", "ذاكرة بتخبو"],
      ["Today: how a recurrent net reads one symbol at a time, and why its memory fades."],
      ["النهارده: الشبكة التكرارية بتقرا رمز واحد في كل مرة إزاي، وليه ذاكرتها بتخبو."]),
    scene(3, "Definition", "Narrator", ["One symbol, one state", "رمز واحد، حالة واحدة"],
      ["A sequence is read one symbol at a time.", "The hidden state is the only memory the next symbol will see."],
      ["المتسلسلة بتتقرأ رمز واحد في كل مرة.", "والحالة المخفية هي الذاكرة الوحيدة اللي الرمز الجاي هيشوفها."],
      ["arrow", "chip", "data"], "cards"),
    scene(4, "Concept", "Narrator", ["A share survives", "حصة بتفضل"],
      ["Each step keeps only a share of that state.", "If the share is near zero, the cue is gone after a few empty steps."],
      ["كل خطوة بتحتفظ بحصة بس من الحالة دي.", "لو الحصة قرب الصفر، الإشارة بتروح بعد شوية خطوات فاضية."],
      ["gauge", "warning"], "list"),
    scene(5, "Concept", "Narrator", ["Near one, it remains", "قرب الواحد، بتفضل"],
      ["Near one, the sign of the cue is still there at the end.", "That is the limit of this simple net: a long gap washes the start away."],
      ["قرب الواحد، علامة الإشارة لسه موجودة في الآخر.", "وده حد الشبكة البسيطة دي: الفجوة الطويلة بتمسح البداية."],
      ["check", "arrow"], "list"),
    scene(6, "Examples", "Narrator", ["Weak and strong", "ضعيفة وقوية"],
      ["Here is how much of the cue is left.", "A weak memory keeps almost none, and a strong memory keeps most of it."],
      ["دي كمية الإشارة اللي فاضلة.", "الذاكرة الضعيفة بتسيب تقريبًا ولا حاجة، والقوية بتسيب معظمها."],
      ["gauge"], "chart"),
    scene(7, "Checkpoint ◆", "Joseph", ["What is left?", "إيه اللي فاضل؟"],
      ["Quick check!", "Three empty steps follow a cue, and the memory is near zero. What is left at the end?"],
      ["سؤال سريع!", "تلات خطوات فاضية بعد الإشارة، والذاكرة قرب الصفر. إيه اللي فاضل في الآخر؟"]),
    scene(8, "Reveal", "Narrator", ["Almost none", "تقريبًا ولا حاجة"],
      ["Almost none of the cue.", "A small memory, multiplied again and again, washes the start away."],
      ["تقريبًا ولا حاجة من الإشارة.", "ذاكرة صغيرة، تتضرب مرة ورا مرة، بتمسح البداية."],
      ["warning", "check"], "list"),
    scene(9, "Lab preview", "Narrator", ["The memory lab", "معمل الذاكرة"],
      ["In the app, open the memory lab.", "Find a memory that keeps more than half the cue, and one that keeps almost none."],
      ["في التطبيق، افتح معمل الذاكرة.", "دور على ذاكرة تسيب أكتر من نص الإشارة، وواحدة تسيب تقريبًا ولا حاجة."],
      ["gauge", "eye", "target"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["One look?", "نظرة واحدة؟"],
      ["Your turn.", "Does a recurrent net read the whole sequence in one look?"],
      ["دورك.", "الشبكة التكرارية بتقرا المتسلسلة كلها بنظرة واحدة؟"]),
    scene(11, "Recap", "Narrator", ["State, then fade", "حالة، وبعدين خبو"],
      ["Remember this.", "The hidden state is the memory, and a long gap fades it. Attention, next, looks back instead."],
      ["افتكر كده.", "الحالة المخفية هي الذاكرة، والفجوة الطويلة بتخبّيها. والانتباه، في اللي بعد كده، بيرجع يبص لورا."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["One empty step", "خطوة فاضية"],
      ["Try it on paper tonight.", "Start from a cue of one, keep half, and take one empty step."],
      ["جرّبها على الورق الليلة.", "ابدأ من إشارة واحد، احتفظ بالنص، وخد خطوة فاضية واحدة."],
      ["pencil", "calculator"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Students say the net reads the sentence.", "Point them at the end number with the slider on the left: the sentence is gone."],
      ["الطلاب بيقولوا إن الشبكة بتقرا الجملة.", "خلّيهم يشاوروا على رقم الآخر والمؤشر على الشمال: الجملة راحت."]),
    2: pairScene(
      ["In the seminar: one symbol at a time, and a number that fades before you name vanishing gradients."],
      ["في الحلقة: رمز واحد في كل مرة، ورقم بيخبو قبل ما تسمّي تلاشّ التدرّج."]),
    9: pairScene(
      ["Students write the end number at two slider positions before you name the idea.", "Then they move the slider and correct the prediction."],
      ["الطلاب يكتبوا رقم الآخر عند موضعين للمؤشر قبل ما تسمّي الفكرة.", "وبعدين يحرّكوا المؤشر ويصحّحوا التوقع."]),
    12: pairScene(
      ["Try it in your next lecture.", "Predict the end number, then slide, then correct the prediction."],
      ["جرّبها في محاضرتك الجاية.", "توقّع رقم الآخر، وبعدين حرّك، وبعدين صحّح التوقع."]),
  },
}));

L.push(lesson({
  n: 4, title: ["Attention and the transformer", "الانتباه والمحوّل"], sub: ["A mix, not a song", "خليط، مش أغنية"],
  chapters: [["Look back", "بص لورا"], ["The mix", "الخليط"], ["Eight notes", "ثماني نغمات"], ["Remember", "تذكّر"]],
  checks: [
    check("Attention builds a new vector by doing what?",
      [["A weighted sum of the other vectors", true], ["Copying only the first symbol", false], ["Forgetting every weight", false]],
      "Correct: the scores become weights, and the new vector is their mix.",
      "Not quite: attention builds a weighted sum of the other vectors.",
      "الانتباه يبني متجه جديد إزاي؟",
      ["مجموع موزون للمتجهات التانية", "نسخ الرمز الأول بس", "نسيان كل وزن"],
      "صح: الدرجات بتبقى أوزان، والمتجه الجديد خليطهم.",
      "لأ: الانتباه يبني مجموع موزون للمتجهات التانية."),
    check("Did those eight notes compose a piece of music?",
      [["No, they continued a count", true], ["Yes, they were trained for years", false], ["They copied a recording", false]],
      "Correct: they continued the counts from one short tune. They did not hear music.",
      "Not quite: eight notes continued a count. They are not a composition.",
      "النغمات التمانية دي ألّفت مقطوعة؟",
      ["لأ، كمّلت عدّ", "أيوه، اتدرّبت سنين", "نسخت تسجيل"],
      "صح: كمّلت أعداد لحن قصير واحد. وما سمعتش موسيقى.",
      "لأ: تمان نغمات كمّلت عدّ. ودي مش مقطوعة."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["Eight notes, no hearing", "تمان نغمات، من غير سمع"],
      ["Eight notes sit in a row.", "The model does not hear music. It only counts which pitch followed which."],
      ["تمان نغمات واقفين في صف.", "النموذج مش سامع موسيقى. هو بس بيعدّ أي درجة جت بعد أي درجة."],
      ["data", "warning"]),
    scene(2, "Title", "Narrator", ["Attention", "الانتباه"],
      ["Today: attention, the transformer, and why eight notes are a count and not a song."],
      ["النهارده: الانتباه، والمحوّل، وليه تمان نغمات عدّ ومش أغنية."]),
    scene(3, "Definition", "Narrator", ["Score, then mix", "قيّم، وبعدين اخلط"],
      ["Attention scores every earlier item and mixes them.", "The new vector is a weighted sum."],
      ["الانتباه بيقيّم كل عنصر سابق وبيخلطهم.", "والمتجه الجديد مجموع موزون."],
      ["target", "layers", "arrow"], "cards"),
    scene(4, "Concept", "Narrator", ["Add the original back", "رجّع الأصل"],
      ["A transformer block adds that mix back onto the original.", "Nothing is forced through one narrow state."],
      ["كتلة المحوّل بترجّع الخليط ده على الأصل.", "ومفيش حاجة بتتفرض تعدّي من حالة ضيقة واحدة."],
      ["layers", "arrow"], "list"),
    scene(5, "Concept", "Narrator", ["The most common follower", "التابع الأكثر"],
      ["The melody lab always picks the most common follower.", "A pitch it never saw follow another cannot appear."],
      ["معمل اللحن دايمًا بيختار التابع الأكثر تكرارًا.", "والدرجة اللي عمرها ما شافها جاية بعد درجة تانية مش ممكن تظهر."],
      ["data", "warning"], "list"),
    scene(6, "Examples", "Narrator", ["The block", "الكتلة"],
      ["Here is one transformer block.", "Attention mixes, and the residual adds the original back."],
      ["دي كتلة محوّل واحدة.", "الانتباه بيخلط، والباقي بيرجّع الأصل."],
      ["layers"], "arch"),
    scene(7, "Checkpoint ◆", "Joseph", ["A new vector", "متجه جديد"],
      ["Quick check!", "Attention builds a new vector by doing what?"],
      ["سؤال سريع!", "الانتباه يبني متجه جديد إزاي؟"]),
    scene(8, "Reveal", "Narrator", ["A weighted sum", "مجموع موزون"],
      ["A weighted sum of the other vectors.", "The scores become weights, and the weights do the mixing."],
      ["مجموع موزون للمتجهات التانية.", "الدرجات بتبقى أوزان، والأوزان هي اللي بتخلط."],
      ["check", "layers"], "list"),
    scene(9, "Lab preview", "Narrator", ["Eight notes", "تمان نغمات"],
      ["In the app, open the eight-note lab.", "Read the tune, then the four notes it writes next, and name one pitch it cannot invent."],
      ["في التطبيق، افتح معمل التمان نغمات.", "اقرأ اللحن، وبعدين الأربع نغمات اللي بيكتبها بعده، وسمّي درجة مش قادر يخترعها."],
      ["data", "eye", "pencil"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["A song?", "أغنية؟"],
      ["Your turn.", "Did those eight notes compose a piece of music?"],
      ["دورك.", "النغمات التمانية دي ألّفت مقطوعة؟"]),
    scene(11, "Recap", "Narrator", ["Mix, then count", "خلط، وبعدين عدّ"],
      ["Remember this.", "Attention mixes, the residual keeps the original, and the eight notes only counted."],
      ["افتكر كده.", "الانتباه بيخلط، والباقي بيحتفظ بالأصل، والتمان نغمات عدّوا بس."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["What was counted", "إيه اللي اتعدّ"],
      ["Try it tonight.", "Write one sentence on what was counted, and what was not."],
      ["جرّبها الليلة.", "اكتب جملة عن اللي اتعدّ، واللي ما اتعدّش."],
      ["pencil", "file"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Do not let attention become the model understands.", "Point at one weight, and at one continued note, and ask what was counted."],
      ["متخلّيش الانتباه يبقى النموذج فاهم.", "شاور على وزن واحد، وعلى نغمة واحدة اتكملت، واسأل إيه اللي اتعدّ."]),
    2: pairScene(
      ["In the seminar: a mix, a residual, and eight notes that are a toy, not a composer."],
      ["في الحلقة: خليط، وباقي، وتمان نغمات لعبة، مش مؤلّف."]),
    9: pairScene(
      ["Before the continuation appears, students say which pitch may follow the last note.", "Then they check the lab."],
      ["قبل ما التكملة تظهر، الطلاب يقولوا أي درجة يجوز تجي بعد النغمة الأخيرة.", "وبعدين يتأكدوا من المعمل."]),
    12: pairScene(
      ["Try it in your next lecture.", "Mark the sentence that separates mixing from understanding."],
      ["جرّبها في محاضرتك الجاية.", "صحّح الجملة اللي بتفصل الخلط عن الفهم."]),
  },
}));

// Course 2
const C2 = [];
C2.push(lesson({
  n: 1, title: ["A picture is a grid of numbers", "الصورة شبكة أرقام"], sub: ["A filter mixes neighbours", "المرشّح يخلط الجيران"],
  chapters: [["A grid", "شبكة"], ["A filter", "مرشّح"], ["No name", "من غير اسم"], ["Remember", "تذكّر"]],
  checks: [
    check("A grey picture on a computer is which of these?",
      [["A grid of numbers", true], ["A list of object names", false], ["One bit for the whole photo", false]],
      "Correct: each cell is a brightness. Colour is three such grids.",
      "Not quite: a grey picture is a grid of numbers.",
      "الصورة الرمادية في الكمبيوتر إيه من دول؟",
      ["شبكة أرقام", "لستة أسماء حاجات", "بت واحد للصورة كلها"],
      "صح: كل خانة سطوع. واللون تلات شبكات من النوع ده.",
      "لأ: الصورة الرمادية شبكة أرقام."),
    check("Does a three by three filter already know it is looking at a face?",
      [["No, it only mixes neighbours", true], ["Yes, that is its job", false], ["Only if the picture is a photo", false]],
      "Correct: it multiplies nine cells. It does not know a name.",
      "Not quite: a small filter only mixes neighbours.",
      "مرشّح تلاتة في تلاتة عارف إنه بيبص على وش؟",
      ["لأ، بيخلط الجيران بس", "أيوه، ده شغله", "بس لو الصورة فوتوغرافية"],
      "صح: بيضرب تسع خانات. ومش عارف اسم.",
      "لأ: المرشّح الصغير بيخلط الجيران بس."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["Numbers, not a name", "أرقام، مش اسم"],
      ["A grey picture is not a thing with a name.", "On the computer it is a grid of numbers, one brightness in each cell."],
      ["الصورة الرمادية مش حاجة ليها اسم.", "على الكمبيوتر هي شبكة أرقام، سطوع واحد في كل خانة."],
      ["data", "warning"]),
    scene(2, "Title", "Narrator", ["A grid of numbers", "شبكة أرقام"],
      ["Today: pictures as grids, and what a small filter actually mixes."],
      ["النهارده: الصور كشبكات، والمرشّح الصغير بيخلط إيه بالظبط."]),
    scene(3, "Definition", "Narrator", ["Cells of brightness", "خانات سطوع"],
      ["A grey image is one grid.", "A colour image is three, and each cell is a brightness, not an object."],
      ["الصورة الرمادية شبكة واحدة.", "والملونة تلاتة، وكل خانة سطوع، مش حاجة."],
      ["data", "layers", "eye"], "cards"),
    scene(4, "Concept", "Narrator", ["Nine cells, one sum", "تسع خانات، مجموع"],
      ["A three by three filter lays on the picture and multiplies nine cells.", "It writes that sum as the new pixel."],
      ["مرشّح تلاتة في تلاتة بيتحط على الصورة وبيضرب تسع خانات.", "وبيكتب المجموع ده بكسل جديد."],
      ["calculator", "arrow"], "list"),
    scene(5, "Concept", "Narrator", ["Edges, or a blur", "حواف، أو طمس"],
      ["An upright-edge filter lights walls.", "A blur averages neighbours, and neither knows it is looking at a face."],
      ["مرشّح الحواف القائمة بينوّر الحيطان.", "والطمس بياخد متوسط الجيران، والاتنين مش عارفين إنهم بيبصوا على وش."],
      ["eye", "warning"], "list"),
    scene(6, "Examples", "Narrator", ["One new pixel", "بكسل جديد"],
      ["Here is one position of the filter.", "Nine multiplications become one number, and the name of the object is not in that number."],
      ["ده موضع واحد للمرشّح.", "تسع ضربات بيبقوا رقم واحد، واسم الحاجة مش جوه الرقم ده."],
      ["calculator"], "chart"),
    scene(7, "Checkpoint ◆", "Joseph", ["What is a picture?", "الصورة إيه؟"],
      ["Quick check!", "A grey picture on a computer is which of these?"],
      ["سؤال سريع!", "الصورة الرمادية في الكمبيوتر إيه من دول؟"]),
    scene(8, "Reveal", "Narrator", ["A grid", "شبكة"],
      ["A grid of numbers.", "Names, if they appear, come from many layers, not from one filter."],
      ["شبكة أرقام.", "الأسماء، لو ظهرت، بتيجي من طبقات كتير، مش من مرشّح واحد."],
      ["check", "layers"], "list"),
    scene(9, "Lab preview", "Narrator", ["The convolution lab", "معمل الطي"],
      ["In the app, open the convolution lab.", "Slide an edge filter and a blur, and say what each new picture shows."],
      ["في التطبيق، افتح معمل الطي.", "حرّك مرشّح حواف وطمس، وقول كل صورة جديدة بتبيّن إيه."],
      ["eye", "layers", "pencil"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["Does it know?", "عارف؟"],
      ["Your turn.", "Does a three by three filter already know it is looking at a face?"],
      ["دورك.", "مرشّح تلاتة في تلاتة عارف إنه بيبص على وش؟"]),
    scene(11, "Recap", "Narrator", ["Mix, do not name", "اخلط، ومتسمّيش"],
      ["Remember this.", "A filter mixes neighbours. It does not name what it sees."],
      ["افتكر كده.", "المرشّح بيخلط الجيران. ومش بيسمّي اللي شايفه."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["One pixel by hand", "بكسل باليد"],
      ["Try it on paper tonight.", "Sketch a three by three edge filter and compute one output pixel."],
      ["جرّبها على الورق الليلة.", "ارسم مرشّح حواف تلاتة في تلاتة واحسب بكسل خرج واحد."],
      ["pencil", "calculator"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Students say the filter sees a door.", "Make them point at the nine multiplications. The door is their name for a pattern of edges."],
      ["الطلاب بيقولوا المرشّح شايف باب.", "خلّيهم يشاوروا على الضربات التسع. الباب اسمهم لنمط من الحواف."]),
    2: pairScene(
      ["In the seminar: a grid, nine multiplications, and a stop before any photo of a person."],
      ["في الحلقة: شبكة، وتسع ضربات، ووقفة قبل أي صورة لشخص."]),
    9: pairScene(
      ["Pairs say the nine-term sum out loud once before they run the filter on the whole picture.", "Drawn edges are enough."],
      ["كل اتنين يقولوا مجموع الحدود التسع بصوت عالي مرة قبل ما يشغّلوا المرشّح على الصورة كلها.", "والحواف المرسومة كفاية."]),
    12: pairScene(
      ["Try it in your next lecture.", "Collect the sentence it knows it is a door, and answer it with the nine multiplications."],
      ["جرّبها في محاضرتك الجاية.", "اجمع جملة هو عارف إنه باب، وردّ عليها بالضربات التسع."]),
  },
}));

C2.push(lesson({
  n: 2, title: ["Who a detector misses", "من يفوّته الكاشف"], sub: ["A face it never trained on", "وش ما اتدرّبش عليه"],
  chapters: [["The average", "المتوسط"], ["The miss", "التفويت"], ["The box", "الصندوق"], ["Remember", "تذكّر"]],
  checks: [
    check("The detector trained on close-set eyes. A wider drawn face scores where?",
      [["Below the line", true], ["Perfect", false], ["The same as the box", false]],
      "Correct: it never saw that spacing, so the match falls under the line.",
      "Not quite: the wider face scores below the line.",
      "الكاشف اتدرّب على عينين قريبين. الوش الأعرض درجته فين؟",
      ["تحت الخط", "كاملة", "زي الصندوق بالظبط"],
      "صح: عمره ما شاف المسافة دي، فالتطابق بينزل تحت الخط.",
      "لأ: الوش الأعرض درجته تحت الخط."),
    check("Is a high score on the training shape enough to trust a detector on new people?",
      [["No, the test must include who is missed", true], ["Yes, a high score is enough", false], ["Only if the box scores zero", false]],
      "Correct: the wide face is still a face, and the detector missed it.",
      "Not quite: a high score on the training shape hides who is missed.",
      "درجة عالية على شكل التدريب تكفي نثق في كاشف على ناس جداد؟",
      ["لأ، الاختبار لازم يقول مين اتفتوت", "أيوه، الدرجة العالية تكفي", "بس لو الصندوق درجته صفر"],
      "صح: الوش العريض لسه وش، والكاشف فوّته.",
      "لأ: الدرجة العالية على شكل التدريب بتخبّي مين اللي اتفتوت."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["Trained on one spacing", "اتدرّب على مسافة واحدة"],
      ["The detector was trained on drawings with the eyes close together.", "A wider face is still a face, and it was never in that average."],
      ["الكاشف اتدرّب على رسومات عيونها قريبة من بعض.", "الوش الأعرض لسه وش، وعمره ما كان في المتوسط ده."],
      ["eye", "warning"]),
    scene(2, "Title", "Narrator", ["Who is missed", "مين اللي بيتفوت"],
      ["Today: who a detector misses, and why a high score on the training shape is not enough."],
      ["النهارده: الكاشف بيفوّت مين، وليه الدرجة العالية على شكل التدريب مش كفاية."]),
    scene(3, "Definition", "Narrator", ["Score and line", "درجة وخط"],
      ["The score is how close a picture is to the average of the training faces.", "The line is the same for every picture."],
      ["الدرجة هي قد إيه الصورة قريبة من متوسط وشوش التدريب.", "والخط واحد لكل صورة."],
      ["target", "gauge", "users"], "cards"),
    scene(4, "Concept", "Narrator", ["Wide, and a box", "عريض، وصندوق"],
      ["The wide face falls below the line.", "The box stays below it too, and that part is correct."],
      ["الوش العريض بينزل تحت الخط.", "والصندوق كمان بيفضل تحته، والجزء ده صح."],
      ["warning", "check"], "list"),
    scene(5, "Concept", "Narrator", ["Drawings, not photos", "رسومات، مش صور"],
      ["A test on only the training shape hides the miss.", "These are drawings, not anyone's photograph."],
      ["اختبار على شكل التدريب بس بيخبّي التفويت.", "ودي رسومات، مش صورة أي شخص."],
      ["shield", "warning"], "list"),
    scene(6, "Examples", "Narrator", ["Same idea, wider", "نفس الفكرة، أعرض"],
      ["Close-set eyes sit in the average.", "Spread them out and the score drops, even though it is still a face."],
      ["العيون القريبة جوه المتوسط.", "باعدها والدرجة بتنزل، مع إن ده لسه وش."],
      ["eye"], "compare"),
    scene(7, "Checkpoint ◆", "Joseph", ["Where is the score?", "الدرجة فين؟"],
      ["Quick check!", "The detector trained on close-set eyes. A wider drawn face scores where?"],
      ["سؤال سريع!", "الكاشف اتدرّب على عينين قريبين. الوش الأعرض درجته فين؟"]),
    scene(8, "Reveal", "Narrator", ["Below the line", "تحت الخط"],
      ["Below the line.", "Same idea, wider spacing, and the match falls short."],
      ["تحت الخط.", "نفس الفكرة، ومسافة أعرض، والتطابق مش مكمّل."],
      ["warning", "check"], "list"),
    scene(9, "Lab preview", "Narrator", ["The detector lab", "معمل الكاشف"],
      ["In the app, open the detector.", "Read the three test scores and say which face was missed."],
      ["في التطبيق، افتح الكاشف.", "اقرأ درجات الاختبار التلاتة وقول أي وش اتفتوت."],
      ["eye", "gauge", "pencil"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["Enough?", "كفاية؟"],
      ["Your turn.", "Is a high score on the training shape enough to trust a detector on new people?"],
      ["دورك.", "درجة عالية على شكل التدريب تكفي نثق في كاشف على ناس جداد؟"]),
    scene(11, "Recap", "Narrator", ["Name the miss", "سمّي التفويت"],
      ["Remember this.", "Report who was missed. Do not test a face detector on real photographs of people."],
      ["افتكر كده.", "اذكر مين اللي اتفتوت. ومتختبرش كاشف وشوش على صور حقيقية لناس."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["The wide score", "درجة العريض"],
      ["Try it tonight.", "Write the line and the wide face's score from the lab."],
      ["جرّبها الليلة.", "اكتب الخط ودرجة الوش العريض من المعمل."],
      ["pencil", "gauge"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Do not assign classmates' photos.", "The drawn set is the seminar, and the mark is a sentence: who was missed."],
      ["متكلّفش بصور الزملاء.", "المجموعة المرسومة هي الحلقة، والتصحيح جملة: مين اللي اتفتوت."]),
    2: pairScene(
      ["In the seminar: one average, one line, and a miss you make them write before any real system."],
      ["في الحلقة: متوسط واحد، وخط واحد، وتفويت تخليهم يكتبوه قبل أي نظام حقيقي."]),
    9: pairScene(
      ["Students write the miss in one sentence before you discuss a real detector.", "If someone opens a camera roll, stop the exercise."],
      ["الطلاب يكتبوا التفويت في جملة واحدة قبل ما تناقش كاشف حقيقي.", "ولو حد فتح ألبوم الكاميرا، وقف التمرين."]),
    12: pairScene(
      ["Try it in your next lecture.", "Add one line to the lab sheet: photographs of people are out of scope."],
      ["جرّبها في محاضرتك الجاية.", "ضيف سطر على ورقة المعمل: صور الناس خارج النطاق."]),
  },
}));

C2.push(lesson({
  n: 3, title: ["Squeeze and sample", "اضغط ثم خذ عيّنة"], sub: ["Two numbers, not the pixels", "رقمين، مش البكسلات"],
  chapters: [["The code", "الرمز"], ["A nudge", "تحريك"], ["Not a photo", "مش صورة"], ["Remember", "تذكّر"]],
  checks: [
    check("The two-number code of the blob is which of these?",
      [["Where the brightness sits", true], ["The name of the object", false], ["A proof the picture is a photo", false]],
      "Correct: encoding takes the centre of the brightness. Decoding paints a blob there.",
      "Not quite: the two numbers are where the brightness sits.",
      "رمز البقعة اللي من رقمين هو إيه من دول؟",
      ["موضع السطوع", "اسم الحاجة", "دليل إن الصورة فوتوغرافية"],
      "صح: الترميز بياخد مركز السطوع. وفك الترميز بيرسم بقعة هناك.",
      "لأ: الرقمين هما موضع السطوع."),
    check("Does nudging the code repair the original pixels?",
      [["No, it paints a new blob", true], ["Yes, it restores the file", false], ["Only if you move both sliders", false]],
      "Correct: the exact pixels were never stored, so a new code is a new picture.",
      "Not quite: a nudge invents a new blob. It does not restore the file.",
      "تحريك الرمز بيصلّح بكسلات الأصل؟",
      ["لأ، بيرسم بقعة جديدة", "أيوه، بيرجّع الملف", "بس لو حرّكت المؤشرين"],
      "صح: البكسلات بالظبط ما تخزّنتش، فالرمز الجديد صورة جديدة.",
      "لأ: التحريك بيخترع بقعة جديدة. ومش بيرجّع الملف."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["Two numbers", "رقمين"],
      ["The blob's code is two numbers: where its brightness sits.", "Decoding paints a blob there, and it does not keep every pixel."],
      ["رمز البقعة رقمين: السطوع قاعد فين.", "وفك الترميز بيرسم بقعة هناك، ومش بيحتفظ بكل بكسل."],
      ["target", "data"]),
    scene(2, "Title", "Narrator", ["Squeeze, then paint", "اضغط، وبعدين ارسم"],
      ["Today: squeeze a picture into a short code, and what a nudge invents."],
      ["النهارده: نضغط صورة في رمز قصير، والتحريك بيخترع إيه."]),
    scene(3, "Definition", "Narrator", ["Centre, then blob", "مركز، وبعدين بقعة"],
      ["Encoding finds the centre of the brightness.", "Decoding paints a new blob at that code."],
      ["الترميز بيدوّر على مركز السطوع.", "وفك الترميز بيرسم بقعة جديدة عند الرمز ده."],
      ["target", "spark", "eye"], "cards"),
    scene(4, "Concept", "Narrator", ["Leave it, then move it", "سيبه، وبعدين حرّكه"],
      ["Leave the code and the decode is close.", "Move it and you invent a new blob, not a repair of the old pixels."],
      ["سيب الرمز وفك الترميز بيبقى قريب.", "حرّكه وهتخترع بقعة جديدة، مش تصليح للبكسلات القديمة."],
      ["check", "warning"], "list"),
    scene(5, "Concept", "Narrator", ["A summary", "ملخّص"],
      ["Two numbers are a summary of this brightness.", "They are not a map of meaning, and they are not a photograph."],
      ["الرقمين ملخّص للسطوع ده.", "ومش خريطة معنى، ومش صورة فوتوغرافية."],
      ["file", "shield"], "list"),
    scene(6, "Examples", "Narrator", ["Code, then picture", "رمز، وبعدين صورة"],
      ["Here the two numbers pick a place.", "The painted blob follows them, and the original pixels do not come back."],
      ["هنا الرقمين بيختاروا مكان.", "والبقعة المرسومة بتمشي وراهم، وبكسلات الأصل مش بترجع."],
      ["target"], "chart"),
    scene(7, "Checkpoint ◆", "Joseph", ["What is the code?", "الرمز إيه؟"],
      ["Quick check!", "The two-number code of the blob is which of these?"],
      ["سؤال سريع!", "رمز البقعة اللي من رقمين هو إيه من دول؟"]),
    scene(8, "Reveal", "Narrator", ["Where it sits", "قاعد فين"],
      ["Where the brightness sits.", "The exact pixels were never stored."],
      ["موضع السطوع.", "والبكسلات بالظبط عمرها ما تخزّنت."],
      ["check", "data"], "list"),
    scene(9, "Lab preview", "Narrator", ["The code lab", "معمل الرمز"],
      ["In the app, open the code lab.", "Leave the sliders, then move one, and say when the decode stopped being a rebuild."],
      ["في التطبيق، افتح معمل الرمز.", "سيب المؤشرات، وبعدين حرّك واحد، وقول امتى الفك بطّل يبقى إعادة بناء."],
      ["target", "arrow", "eye"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["A repair?", "تصليح؟"],
      ["Your turn.", "Does nudging the code repair the original pixels?"],
      ["دورك.", "تحريك الرمز بيصلّح بكسلات الأصل؟"]),
    scene(11, "Recap", "Narrator", ["New, not repaired", "جديد، مش متصلّح"],
      ["Remember this.", "A short code rebuilds a summary. A moved code is a new picture."],
      ["افتكر كده.", "الرمز القصير بيعيد بناء ملخّص. والرمز اللي اتحرّك صورة جديدة."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["Write both codes", "اكتب الرمزين"],
      ["Try it tonight.", "Write the two numbers of the original blob, then the difference after one nudge."],
      ["جرّبها الليلة.", "اكتب رقمي البقعة الأصلية، وبعدين الفرق بعد تحريكة واحدة."],
      ["pencil", "calculator"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Strike the sentence the latent space understands the picture.", "Replace it with what the two numbers actually are."],
      ["اشطب جملة الفضاء الكامن فاهم الصورة.", "وحط مكانها الرقمين دول إيه بالظبط."]),
    2: pairScene(
      ["In the seminar: a slider, a difference that grows, and a banned sentence about understanding."],
      ["في الحلقة: مؤشر، وفرق بيكبر، وجملة ممنوعة عن الفهم."]),
    9: pairScene(
      ["Ask for the sentence before the slider moves, and again after.", "The mark is that the nudged decode is new, not repaired."],
      ["اطلب الجملة قبل ما المؤشر يتحرك، ومرة كمان بعده.", "والتصحيح إن الفك المتحرّك جديد، مش متصلح."]),
    12: pairScene(
      ["Try it in your next lecture.", "Bring one forbidden sentence and have them repair it."],
      ["جرّبها في محاضرتك الجاية.", "هات جملة ممنوعة وخليهم يصلّحوها."]),
  },
}));

C2.push(lesson({
  n: 4, title: ["Adversaries and noise", "خصمان وضجيج"], sub: ["One step is not a picture", "خطوة واحدة مش صورة"],
  chapters: [["Three ideas", "تلات أفكار"], ["One step", "خطوة واحدة"], ["Not evidence", "مش دليل"], ["Remember", "تذكّر"]],
  checks: [
    check("Which idea removes a little noise at a time?",
      [["Diffusion", true], ["A single edge filter", false], ["A password hash", false]],
      "Correct: diffusion repeats a small denoise. One step in the lab is the idea, not a finished generator.",
      "Not quite: diffusion is the idea that removes a little noise at a time.",
      "أي فكرة بتشيل شوية ضوضاء في كل مرة؟",
      ["الانتشار", "مرشّح حواف واحد", "تجزئة كلمة سر"],
      "صح: الانتشار بيكرّر إزالة ضوضاء صغيرة. والخطوة في المعمل هي الفكرة، مش مولّد خلصان.",
      "لأ: الانتشار هو الفكرة اللي بتشيل شوية ضوضاء في كل مرة."),
    check("Is a picture from a generator evidence of what it shows?",
      [["No, it is a sample and it can be false", true], ["Yes, if it looks sharp", false], ["Only when the noise is low", false]],
      "Correct: it is a sample from a loss. It can be confident and false.",
      "Not quite: a generated picture is not evidence of what it shows.",
      "صورة من مولّد دليل على اللي بتبيّنه؟",
      ["لأ، عيّنة وممكن تبقى غلط", "أيوه، لو شكلها حاد", "بس لما الضوضاء قليلة"],
      "صح: دي عيّنة من خسارة. وممكن تبقى واثقة وغلطانة.",
      "لأ: الصورة المتولّدة مش دليل على اللي بتبيّنه."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["Three ways to invent", "تلات طرق للاختراع"],
      ["Three ideas invent a picture.", "One rebuilds from a code, one tries to fool a judge, and one removes a little noise at a time."],
      ["تلات أفكار بيخترعوا صورة.", "واحد بيعيد البناء من رمز، وواحد بيحاول يخدع قاضي، وواحد بيشيل شوية ضوضاء في كل مرة."],
      ["spark", "users", "gauge"]),
    scene(2, "Title", "Narrator", ["A contest and a step", "منافسة وخطوة"],
      ["Today: a contest, a denoise step, and why one step is not a finished picture."],
      ["النهارده: منافسة، وخطوة تشيل الضوضاء، وليه الخطوة الواحدة مش صورة خلصانة."]),
    scene(3, "Definition", "Narrator", ["Inventor and judge", "مخترع وقاضي"],
      ["A generative contest trains one network to fool another.", "The contest can collapse, and a sharp sample is still not a proof."],
      ["المنافسة التوليدية بتدرّب شبكة تخدع شبكة تانية.", "والمنافسة ممكن تنهار، والعيّنة الحادة برضه مش دليل."],
      ["users", "warning", "shield"], "cards"),
    scene(4, "Concept", "Narrator", ["Undo a little", "الغي شوية"],
      ["Diffusion adds noise until the picture is gone.", "Then it learns a step that removes a little, and repeats that step."],
      ["الانتشار بيضيف ضوضاء لحد ما الصورة تختفي.", "وبعدين يتعلّم خطوة تشيل شوية، ويكرّر الخطوة دي."],
      ["gauge", "repeat"], "list"),
    scene(5, "Concept", "Narrator", ["A plus sign", "علامة زائد"],
      ["The lab takes one step on a plus sign, pulling each pixel toward black or white.", "Heavy noise leaves the plus unfinished."],
      ["المعمل بياخد خطوة واحدة على علامة زائد، ويسحب كل بكسل ناحية الأسود أو الأبيض.", "والضوضاء التقيلة بتسيب الزائد مش خلصان."],
      ["warning", "check"], "list"),
    scene(6, "Examples", "Narrator", ["Three rows", "تلات صفوف"],
      ["Put the three names in a row before you admire any sample.", "Rebuild, contest, and denoise are different losses."],
      ["حط التلات أسماء في صف قبل ما تعجب بأي عيّنة.", "إعادة البناء، والمنافسة، وإزالة الضوضاء، تلات خسائر مختلفة."],
      ["file"], "chart"),
    scene(7, "Checkpoint ◆", "Joseph", ["Which idea?", "أي فكرة؟"],
      ["Quick check!", "Which idea removes a little noise at a time?"],
      ["سؤال سريع!", "أي فكرة بتشيل شوية ضوضاء في كل مرة؟"]),
    scene(8, "Reveal", "Narrator", ["Diffusion", "الانتشار"],
      ["Diffusion.", "One step in the lab is the idea, not a trained generator."],
      ["الانتشار.", "الخطوة الواحدة في المعمل هي الفكرة، مش مولّد متدرّب."],
      ["check", "gauge"], "list"),
    scene(9, "Lab preview", "Narrator", ["The denoise lab", "معمل إزالة الضوضاء"],
      ["In the app, open the denoise lab.", "Set the noise in the middle and at the far right, and say what one step did not restore."],
      ["في التطبيق، افتح معمل إزالة الضوضاء.", "خلّي الضوضاء في النص وفي أقصى اليمين، وقول الخطوة الواحدة مرجّعتش إيه."],
      ["gauge", "eye", "warning"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["Evidence?", "دليل؟"],
      ["Your turn.", "Is a picture from a generator evidence of what it shows?"],
      ["دورك.", "صورة من مولّد دليل على اللي بتبيّنه؟"]),
    scene(11, "Recap", "Narrator", ["Not evidence", "مش دليل"],
      ["Remember this.", "Three different losses. A generated picture is not evidence."],
      ["افتكر كده.", "تلات خسائر مختلفة. والصورة المتولّدة مش دليل."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["Three failures", "تلات فشلات"],
      ["Try it tonight.", "Write the three methods and one failure each."],
      ["جرّبها الليلة.", "اكتب التلات طرق وفشل واحد لكل طريقة."],
      ["pencil", "file"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Put the three names on the board before any sample is admired.", "The lab is one row of that table, not the whole lecture."],
      ["حط التلات أسماء على السبورة قبل ما حد يعجب بعيّنة.", "والمعمل صف واحد من الجدول ده، مش المحاضرة كلها."]),
    2: pairScene(
      ["In the seminar: rebuild, contest, denoise, and a sample you will not mark as evidence."],
      ["في الحلقة: إعادة بناء، ومنافسة، وإزالة ضوضاء، وعيّنة مش هتصحّحها كدليل."]),
    9: pairScene(
      ["Students fill the three-row table from the reading, then use the lab as the diffusion row only.", "Mark anyone who calls the blur the model's photo."],
      ["الطلاب يملوا جدول التلات صفوف من القراءة، وبعدين يستخدموا المعمل صف الانتشار بس.", "وصحّح أي حد يسمّي الطمس صورة النموذج."]),
    12: pairScene(
      ["Try it in your next lecture.", "Bring a generated image from the news and ask which failure it might be. Do not grade the guess as fact."],
      ["جرّبها في محاضرتك الجاية.", "هات صورة متولّدة من الأخبار واسأل ممكن تبقى فشل أنهي طريقة. ومتصحّحش التخمين كأنه حقيقة."]),
  },
}));

const C3 = [];
C3.push(lesson({
  n: 1, title: ["Learn from reward", "التعلّم من المكافأة"], sub: ["Credit that arrives late", "فضل بيوصل متأخر"],
  chapters: [["Late credit", "فضل متأخر"], ["Two pictures", "صورتين"], ["A bad reward", "مكافأة وحشة"], ["Remember", "تذكّر"]],
  checks: [
    check("A reward arrives after a path of actions. The hard part is which of these?",
      [["Sending the credit back along the path", true], ["Storing the reward as a password", false], ["Ignoring the world", false]],
      "Correct: the earlier steps have to learn that they helped.",
      "Not quite: the hard part is sending the credit back along the path.",
      "المكافأة بتوصل بعد مسار من الأفعال. الجزء الصعب إيه من دول؟",
      ["رجوع الفضل على طول المسار", "تخزين المكافأة كلمة سر", "تجاهل الدنيا"],
      "صح: الخطوات الأولى لازم تتعلّم إنها ساعدت.",
      "لأ: الجزء الصعب هو رجوع الفضل على طول المسار."),
    check("Are a value and a policy the same picture?",
      [["No, value is how good and policy is what to do", true], ["Yes, they are synonyms", false], ["Policy is only the reward", false]],
      "Correct: value is how good a place is. Policy is what to do there.",
      "Not quite: value and policy are different pictures.",
      "القيمة والسياسة صورة واحدة؟",
      ["لأ، القيمة قد إيه كويس والسياسة تعمل إيه", "أيوه، هما مرادف", "السياسة هي المكافأة بس"],
      "صح: القيمة قد إيه المكان كويس. والسياسة تعمل إيه هناك.",
      "لأ: القيمة والسياسة صورتين مختلفين."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["The charger is at the end", "الشاحن في الآخر"],
      ["The charger is at the end of the path.", "The early steps get no reward, and they still have to learn that they helped."],
      ["الشاحن في آخر المسار.", "الخطوات الأولى مش بتاخد مكافأة، وبرضه لازم تتعلّم إنها ساعدت."],
      ["target", "arrow"]),
    scene(2, "Title", "Narrator", ["Reward, value, policy", "مكافأة، قيمة، سياسة"],
      ["Today: reward, value, and a policy, and why a sensible reward can still teach the wrong behaviour."],
      ["النهارده: المكافأة، والقيمة، والسياسة، وليه مكافأة شكلها معقول ممكن تعلّم السلوك الغلط."]),
    scene(3, "Definition", "Narrator", ["Credit travels back", "الفضل يرجع لورا"],
      ["An action changes the world.", "The reward may arrive later, so the credit has to travel back along the path."],
      ["الفعل بيغيّر الدنيا.", "والمكافأة ممكن توصل بعدين، فالفضل لازم يرجع على طول المسار."],
      ["arrow", "gauge", "map"], "cards"),
    scene(4, "Concept", "Narrator", ["How good, and what to do", "قد إيه كويس، وتعمل إيه"],
      ["Value is how good it is to stand on a square.", "Policy is what to do there, and they are different pictures."],
      ["القيمة هي قد إيه الوقوف على المربع كويس.", "والسياسة هي تعمل إيه هناك، وهما صورتين مختلفين."],
      ["map", "arrow"], "list"),
    scene(5, "Concept", "Narrator", ["A reward can backfire", "المكافأة ممكن ترتد"],
      ["Score spinning highly and a robot will spin in the puddle.", "The number is not an ethic."],
      ["ادي الدوران درجة عالية والروبوت هيلف في البركة.", "والرقم مش أخلاق."],
      ["warning", "gauge"], "list"),
    scene(6, "Examples", "Narrator", ["From the charger", "من الشاحن"],
      ["The values spread out from the charger.", "The policy then picks a direction on each square."],
      ["القيم بتنتشر من الشاحن.", "وبعدين السياسة تختار اتجاه على كل مربع."],
      ["map"], "compare"),
    scene(7, "Checkpoint ◆", "Joseph", ["The hard part", "الجزء الصعب"],
      ["Quick check!", "A reward arrives after a path of actions. The hard part is which of these?"],
      ["سؤال سريع!", "المكافأة بتوصل بعد مسار من الأفعال. الجزء الصعب إيه من دول؟"]),
    scene(8, "Reveal", "Narrator", ["Send the credit back", "رجّع الفضل"],
      ["Sending the credit back along the path.", "The earlier steps have to learn that they helped."],
      ["رجوع الفضل على طول المسار.", "الخطوات الأولى لازم تتعلّم إنها ساعدت."],
      ["check", "arrow"], "list"),
    scene(9, "Lab preview", "Narrator", ["The reward lab", "معمل المكافأة"],
      ["In the app, open the reward lab.", "Watch the values spread, and point at one square's value and the action taken there."],
      ["في التطبيق، افتح معمل المكافأة.", "شوف القيم وهي بتنتشر، وشاور على قيمة مربع والفعل اللي اتاخد هناك."],
      ["map", "eye", "arrow"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["Same picture?", "نفس الصورة؟"],
      ["Your turn.", "Are a value and a policy the same picture?"],
      ["دورك.", "القيمة والسياسة صورة واحدة؟"]),
    scene(11, "Recap", "Narrator", ["Keep them apart", "خليهم منفصلين"],
      ["Remember this.", "A reward that looks right can train a bad policy. Keep value and policy apart."],
      ["افتكر كده.", "مكافأة شكلها صح ممكن تدرّب سياسة وحشة. خلّي القيمة والسياسة منفصلين."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["A bad reward", "مكافأة وحشة"],
      ["Try it tonight.", "Write a one-line reward that would teach the wrong behaviour."],
      ["جرّبها الليلة.", "اكتب مكافأة من سطر تعلّم السلوك الغلط."],
      ["pencil", "warning"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Have the class invent a reward that looks virtuous and breaks the task.", "Then separate the value picture from the policy picture on the board."],
      ["خلّي الصف يخترع مكافأة شكلها كويس وبتكسر المهمة.", "وبعدين افصل صورة القيمة عن صورة السياسة على السبورة."]),
    2: pairScene(
      ["In the seminar: late credit, two words you will not let them swap, and a reward that backfires."],
      ["في الحلقة: فضل متأخر، وكلمتين مش هتسيبهم يبدّلوهم، ومكافأة بترتد."]),
    9: pairScene(
      ["Two columns on the board: value, and policy.", "Students fill one row from the lab before you discuss a real system."],
      ["عمودين على السبورة: القيمة، والسياسة.", "والطلاب يملوا صف واحد من المعمل قبل ما تناقش نظام حقيقي."]),
    12: pairScene(
      ["Try it in your next lecture.", "Bring the wrong reward before the lab, and mark any paragraph that treats the two words as synonyms."],
      ["جرّبها في محاضرتك الجاية.", "هات المكافأة الغلط قبل المعمل، وصحّح أي فقرة بتتعامل مع الكلمتين كمرادف."]),
  },
}));

C3.push(lesson({
  n: 2, title: ["A language model, and changing one", "نموذج لغوي، وتغييره"], sub: ["Only the last layer", "الطبقة الأخيرة بس"],
  chapters: [["Next token", "الرمز الجاي"], ["Frozen", "مجمّد"], ["An old skill", "مهارة قديمة"], ["Remember", "تذكّر"]],
  checks: [
    check("Fine-tuning, in the small lab, changes which of these?",
      [["The last layer, on a few examples", true], ["Every weight in a huge model", false], ["The spelling of the training text", false]],
      "Correct: the rest stays frozen. That is the honest small version.",
      "Not quite: the small lab changes the last layer, on a few examples.",
      "التعديل الدقيق، في المعمل الصغير، بيغيّر إيه من دول؟",
      ["الطبقة الأخيرة، على أمثلة قليلة", "كل وزن في نموذج ضخم", "إملاء نص التدريب"],
      "صح: الباقي بيفضل مجمّد. ودي النسخة الصغيرة الصادقة.",
      "لأ: المعمل الصغير بيغيّر الطبقة الأخيرة، على أمثلة قليلة."),
    check("Does a language model look facts up as it writes?",
      [["No, it guesses the next token", true], ["Yes, it searches a library", false], ["Only in one language", false]],
      "Correct: it guesses the next token from patterns, unless a separate tool searches.",
      "Not quite: a language model guesses the next token. It does not look facts up.",
      "النموذج اللغوي بيدوّر على الحقائق وهو بيكتب؟",
      ["لأ، بيخمّن الرمز الجاي", "أيوه، بيدوّر في مكتبة", "بلغة واحدة بس"],
      "صح: بيخمّن الرمز الجاي من الأنماط، إلا لو أداة لوحدها دوّرت.",
      "لأ: النموذج اللغوي بيخمّن الرمز الجاي. ومش بيدوّر على حقائق."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["A guess, not a lookup", "تخمين، مش بحث"],
      ["A language model guesses the next token from patterns.", "It does not look facts up, unless a separate tool searches."],
      ["النموذج اللغوي بيخمّن الرمز الجاي من الأنماط.", "ومش بيدوّر على حقائق، إلا لو أداة لوحدها دوّرت."],
      ["bot", "warning"]),
    scene(2, "Title", "Narrator", ["What moved", "إيه اللي اتحرّك"],
      ["Today: what fine-tuning changes in the small lab, and what stays frozen."],
      ["النهارده: التعديل الدقيق في المعمل الصغير بيغيّر إيه، وإيه اللي بيفضل مجمّد."]),
    scene(3, "Definition", "Narrator", ["Last layer only", "الطبقة الأخيرة بس"],
      ["The small fine-tune teaches only the last layer, on a few examples.", "The rest of the weights do not move."],
      ["التعديل الدقيق الصغير بيعلّم الطبقة الأخيرة بس، على أمثلة قليلة.", "وباقي الأوزان مش بتتحرك."],
      ["layers", "lock", "check"], "cards"),
    scene(4, "Concept", "Narrator", ["Honest and small", "صادق وصغير"],
      ["That is the honest version a phone can run.", "It will not absorb a library."],
      ["دي النسخة الصادقة اللي الموبايل يقدر يشغّلها.", "ومش هتبلع مكتبة."],
      ["phone", "file"], "list"),
    scene(5, "Concept", "Narrator", ["An old skill slips", "مهارة قديمة بتزحلق"],
      ["An old skill can be crowded out.", "Say which part moved before you say the model learned."],
      ["مهارة قديمة ممكن تتزاحم.", "قول أي جزء اتحرّك قبل ما تقول النموذج اتعلّم."],
      ["warning", "eye"], "list"),
    scene(6, "Examples", "Narrator", ["Frozen, then the top", "مجمّد، وبعدين القمة"],
      ["Here the lower blocks stay still.", "Only the last block is allowed to change."],
      ["هنا البلوكات اللي تحت بتفضل ثابتة.", "والبلوك الأخير بس مسموح له يتغيّر."],
      ["layers"], "arch"),
    scene(7, "Checkpoint ◆", "Joseph", ["What changes?", "إيه بيتغيّر؟"],
      ["Quick check!", "Fine-tuning, in the small lab, changes which of these?"],
      ["سؤال سريع!", "التعديل الدقيق، في المعمل الصغير، بيغيّر إيه من دول؟"]),
    scene(8, "Reveal", "Narrator", ["The last layer", "الطبقة الأخيرة"],
      ["The last layer, on a few examples.", "The rest stays frozen."],
      ["الطبقة الأخيرة، على أمثلة قليلة.", "والباقي بيفضل مجمّد."],
      ["check", "lock"], "list"),
    scene(9, "Lab preview", "Narrator", ["The teach lab", "معمل التعليم"],
      ["In the app, open the teach lab.", "Teach the top layer a new job, and name one old answer you would now check."],
      ["في التطبيق، افتح معمل التعليم.", "علّم الطبقة اللي فوق مهمة جديدة، وسمّي إجابة قديمة هتراجعها دلوقتي."],
      ["bot", "eye", "pencil"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["A lookup?", "بحث؟"],
      ["Your turn.", "Does a language model look facts up as it writes?"],
      ["دورك.", "النموذج اللغوي بيدوّر على الحقائق وهو بيكتب؟"]),
    scene(11, "Recap", "Narrator", ["Name the layer", "سمّي الطبقة"],
      ["Remember this.", "Name the layer that moved. An old skill can slip."],
      ["افتكر كده.", "سمّي الطبقة اللي اتحركت. ومهارة قديمة ممكن تتزحلق."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["What did not move", "إيه اللي ما اتحرّكش"],
      ["Try it tonight.", "Write what the update was allowed to change, and what it did not have the size to change."],
      ["جرّبها الليلة.", "اكتب إيه اللي التحديث كان مسموح يغيّره، وإيه اللي معندوش حجم يغيّره."],
      ["pencil", "lock"], "list"),
  ],
  arch: "gpt",
  teach: {
    1: pairScene(
      ["A paragraph that says we fine-tuned the model, with no layer named, is incomplete.", "The frozen part has to be visible."],
      ["فقرة بتقول عدّلنا النموذج، من غير ما تسمّي طبقة، ناقصة.", "والجزء المجمّد لازم يبقى ظاهر."]),
    2: pairScene(
      ["In the seminar: next token, a frozen stack, and a rubric line that unnamed weights score zero."],
      ["في الحلقة: الرمز الجاي، وكومة مجمّدة، وسطر في المعيار إن الأوزان اللي من غير اسم درجتها صفر."]),
    9: pairScene(
      ["Mark only write-ups that name the frozen layers.", "Warn that a confident rewrite of an old fact is the crowding, not a feature."],
      ["متصحّحش غير الكتابات اللي بتسمّي الطبقات المجمّدة.", "وحذّر إن إعادة كتابة واثقة لحقيقة قديمة هي المزاحمة، مش ميزة."]),
    12: pairScene(
      ["Try it in your next lecture.", "Three answers that say the model was fine-tuned, and the same reason each scores zero."],
      ["جرّبها في محاضرتك الجاية.", "تلات إجابات بتقول النموذج اتعدّل، ونفس السبب لكل واحدة درجتها صفر."]),
  },
}));

C3.push(lesson({
  n: 3, title: ["Laws, tests and a person who can look", "قوانين واختبارات وشخص يستطيع أن يرى"], sub: ["One missed refusal", "رفض فائت واحد"],
  chapters: [["Three duties", "تلات واجبات"], ["A refusal", "رفض"], ["One miss", "خطأ واحد"], ["Remember", "تذكّر"]],
  checks: [
    check("A model scores perfectly on its training cases and answers a case it should refuse. The suite has what?",
      [["Has not passed", true], ["Has passed", false], ["Needs no refusal cases", false]],
      "Correct: one missed refusal fails the suite. The other scores do not cancel it.",
      "Not quite: the suite has not passed.",
      "النموذج نجح تمام في حالات تدريبه ورد على حالة كان لازم يرفضها. الاختبار عمل إيه؟",
      ["ما نجحش", "نجح", "مش محتاج حالات رفض"],
      "صح: رفض فائت واحد بيفشل الاختبار. والدرجات التانية مش بتلغيه.",
      "لأ: الاختبار ما نجحش."),
    check("Which duty does a missed refusal break first?",
      [["Test before use", true], ["A bigger computer", false], ["A faster voice", false]],
      "Correct: a test before use includes the case the model must refuse.",
      "Not quite: the first duty is to test before use, refusals included.",
      "الرفض الفائت بيكسر أي واجب الأول؟",
      ["الاختبار قبل الاستعمال", "كمبيوتر أكبر", "صوت أسرع"],
      "صح: الاختبار قبل الاستعمال بيشمل الحالة اللي النموذج لازم يرفضها.",
      "لأ: الواجب الأول هو الاختبار قبل الاستعمال، والرفض جواه."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["A score can hide a stop", "درجة ممكن تخبّي وقفة"],
      ["A test that only counts right answers can hide a model that should have stopped.", "One missed refusal fails the whole suite."],
      ["اختبار بيعدّ الإجابات الصح بس ممكن يخبّي نموذج كان لازم يقف.", "ورفض فائت واحد بيفشل الاختبار كله."],
      ["warning", "shield"]),
    scene(2, "Title", "Narrator", ["Test, show, and a person", "اختبر، وبيّن، وشخص"],
      ["Today: three duties, and a test that includes a case the model must refuse."],
      ["النهارده: تلات واجبات، واختبار فيه حالة النموذج لازم يرفضها."]),
    scene(3, "Definition", "Narrator", ["Three duties", "تلات واجبات"],
      ["Test before use.", "Keep the actions visible, and keep a person responsible."],
      ["اختبر قبل الاستعمال.", "خلّي الأفعال ظاهرة، وخلّي شخص مسؤول."],
      ["check", "eye", "users"], "cards"),
    scene(4, "Concept", "Narrator", ["A pass on a refusal", "ناجح على رفض"],
      ["A required refusal marked as pass fails the suite.", "The other cases can all be right, and it still fails."],
      ["رفض مطلوب اتعلّم عليه ناجح بيفشل الاختبار.", "وباقي الحالات ممكن كلها تبقى صح، وبرضه بيفشل."],
      ["warning", "check"], "list"),
    scene(5, "Concept", "Narrator", ["Four refusals", "أربع رفضات"],
      ["A photo named from a class list, a mark changed without the lecturer, a secret repeated, a message that fishes a password.", "Those are refusals, not trick questions."],
      ["صورة تتسمّى من لستة فصل، ودرجة تتغيّر من غير الدكتور، وسر يتقال تاني، ورسالة تصطاد كلمة سر.", "دول رفض، مش أسئلة فخ."],
      ["shield", "lock"], "list"),
    scene(6, "Examples", "Narrator", ["Missed, or held", "فائت، أو ممسوك"],
      ["Mark the refusals as refuse and the suite can hold.", "Flip one of them to pass and the suite fails on that one miss."],
      ["علّم على الرفضات مرفوض والاختبار ممكن يمسك.", "اقلب واحدة منهم لناجح والاختبار يفشل بالغلطة الواحدة دي."],
      ["check"], "compare"),
    scene(7, "Checkpoint ◆", "Joseph", ["Has it passed?", "نجح؟"],
      ["Quick check!", "A model scores perfectly on its training cases and answers a case it should refuse. The suite has what?"],
      ["سؤال سريع!", "النموذج نجح تمام في حالات تدريبه ورد على حالة كان لازم يرفضها. الاختبار عمل إيه؟"]),
    scene(8, "Reveal", "Narrator", ["It has not passed", "ما نجحش"],
      ["It has not passed.", "The other scores do not cancel one missed refusal."],
      ["ما نجحش.", "والدرجات التانية مش بتلغي رفض فائت واحد."],
      ["warning", "check"], "list"),
    scene(9, "Lab preview", "Narrator", ["The suite", "الاختبار"],
      ["In the app, open the suite.", "Mark every case, then flip one required refusal to pass, and read the failure."],
      ["في التطبيق، افتح الاختبار.", "علّم على كل حالة، وبعدين اقلب رفض مطلوب لناجح، واقرأ الفشل."],
      ["shield", "eye", "warning"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["Which duty?", "أي واجب؟"],
      ["Your turn.", "Which duty does a missed refusal break first?"],
      ["دورك.", "الرفض الفائت بيكسر أي واجب الأول؟"]),
    scene(11, "Recap", "Narrator", ["Include the refusal", "حط الرفض"],
      ["Remember this.", "A high score without a refusal case has not finished the test."],
      ["افتكر كده.", "درجة عالية من غير حالة رفض معناها الاختبار ما خلّصش."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["One of your own", "واحد من عندك"],
      ["Try it tonight.", "Add one refusal case from your own university, not from the lab list."],
      ["جرّبها الليلة.", "ضيف حالة رفض من جامعتك، مش من لستة المعمل."],
      ["pencil", "shield"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Mark the test design, not the adjective safe.", "A student who reports ninety percent and omits the refusal has not finished."],
      ["صحّح تصميم الاختبار، مش صفة آمن.", "والطالب اللي بيقول تسعين في المية ويسيب الرفض ما خلّصش."]),
    2: pairScene(
      ["In the seminar: one rubric line. A missed refusal is a fail, whatever the other score."],
      ["في الحلقة: سطر واحد في المعيار. الرفض الفائت رسوب، مهما كانت الدرجة التانية."]),
    9: pairScene(
      ["Put that line on the rubric before the lab, not after someone celebrates a score.", "Connect it in one sentence to the detector that missed the wide face."],
      ["حط السطر ده في المعيار قبل المعمل، مش بعد ما حد يحتفل بدرجة.", "وصِله في جملة واحدة بالكاشف اللي فوّت الوش العريض."]),
    12: pairScene(
      ["Try it in your next lecture.", "Three student claims of a high score with no refusal, and the one line that fails all three."],
      ["جرّبها في محاضرتك الجاية.", "تلات ادّعاءات طلاب بدرجة عالية من غير رفض، والسطر الواحد اللي يفشل التلاتة."]),
  },
}));

C3.push(lesson({
  n: 4, title: ["Science stand-ins, and one machine", "بدائل علمية، وجهاز واحد"], sub: ["Split the layer when it is wide", "قسّم الطبقة لما تبقى عريضة"],
  chapters: [["A stand-in", "بديل"], ["Memory", "الذاكرة"], ["Two splits", "تقسيمين"], ["Remember", "تذكّر"]],
  checks: [
    check("A layer does not fit on one machine because it is wide. What do you do?",
      [["Split the layer", true], ["Only split the examples", false], ["Store the activations as passwords", false]],
      "Correct: splitting the examples still copies the whole layer onto each machine.",
      "Not quite: a wide layer needs the layer itself split.",
      "طبقة مش داخلة على جهاز واحد لأنها عريضة. تعمل إيه؟",
      ["تقسّم الطبقة", "تقسّم الأمثلة بس", "تخزّن التنشيطات ككلمات سر"],
      "صح: تقسيم الأمثلة لسه بينسخ الطبقة كلها على كل جهاز.",
      "لأ: الطبقة العريضة محتاجة الطبقة نفسها تتقسم."),
    check("Is a fast stand-in for a lab measurement the experiment itself?",
      [["No, it is not the measurement", true], ["Yes, if it is fast", false], ["Only on a phone", false]],
      "Correct: it is useful where it was tested. It is not the measurement.",
      "Not quite: a stand-in is not the experiment.",
      "البديل السريع لقياس معملي هو التجربة نفسها؟",
      ["لأ، مش القياس", "أيوه، لو سريع", "على الموبايل بس"],
      "صح: مفيد في الحتة اللي اتختبر فيها. ومش هو القياس.",
      "لأ: البديل مش التجربة."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["Too wide for one machine", "أعرض من جهاز"],
      ["A wide layer does not fit on one machine.", "Splitting the examples still copies the whole layer onto each machine."],
      ["الطبقة العريضة مش داخلة على جهاز واحد.", "وتقسيم الأمثلة لسه بينسخ الطبقة كلها على كل جهاز."],
      ["layers", "warning"]),
    scene(2, "Title", "Narrator", ["Stand-in, and a split", "بديل، وتقسيم"],
      ["Today: a scientific stand-in, and when you split the examples or the layer."],
      ["النهارده: بديل علمي، وامتى تقسّم الأمثلة وامتى تقسّم الطبقة."]),
    scene(3, "Definition", "Narrator", ["Not the experiment", "مش التجربة"],
      ["A model can stand in for a slow experiment.", "It is useful where it was tested, and it is not the measurement."],
      ["نموذج يقدر ينوب عن تجربة بطيئة.", "ومفيد في الحتة اللي اتختبر فيها، ومش هو القياس."],
      ["gauge", "shield", "check"], "cards"),
    scene(4, "Concept", "Narrator", ["Weights and activations", "أوزان وتنشيطات"],
      ["One training step stores the weights and the activations.", "Activations grow with the batch and with the width."],
      ["خطوة التدريب الواحدة بتخزّن الأوزان والتنشيطات.", "والتنشيطات بتكبر مع الدفعة ومع العرض."],
      ["chip", "layers"], "list"),
    scene(5, "Concept", "Narrator", ["Two ways to split", "طريقتين للتقسيم"],
      ["Data parallel copies the whole model and splits the examples.", "Model parallel splits the layer when that copy does not fit."],
      ["توازي البيانات بينسخ النموذج كله ويقسّم الأمثلة.", "وتوازي النموذج بيقسّم الطبقة لما النسخة دي متدخلش."],
      ["arrow", "layers"], "list"),
    scene(6, "Examples", "Narrator", ["Which one fits", "أنهي واحد داخل"],
      ["On a wide layer, splitting the examples does not fit.", "Splitting the layer does."],
      ["على طبقة عريضة، تقسيم الأمثلة مش داخل.", "وتقسيم الطبقة داخل."],
      ["layers"], "compare"),
    scene(7, "Checkpoint ◆", "Joseph", ["A wide layer", "طبقة عريضة"],
      ["Quick check!", "A layer does not fit on one machine because it is wide. What do you do?"],
      ["سؤال سريع!", "طبقة مش داخلة على جهاز واحد لأنها عريضة. تعمل إيه؟"]),
    scene(8, "Reveal", "Narrator", ["Split the layer", "قسّم الطبقة"],
      ["Split the layer.", "Splitting the examples still copies the whole layer."],
      ["قسّم الطبقة.", "وتقسيم الأمثلة لسه بينسخ الطبقة كلها."],
      ["check", "layers"], "list"),
    scene(9, "Lab preview", "Narrator", ["The split lab", "معمل التقسيم"],
      ["In the app, open the split lab.", "On the wide layer try both splits, and write which one fitted."],
      ["في التطبيق، افتح معمل التقسيم.", "على الطبقة العريضة جرّب التقسيمين، واكتب أنهي واحد دخل."],
      ["layers", "eye", "pencil"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["The experiment?", "التجربة؟"],
      ["Your turn.", "Is a fast stand-in for a lab measurement the experiment itself?"],
      ["دورك.", "البديل السريع لقياس معملي هو التجربة نفسها؟"]),
    scene(11, "Recap", "Narrator", ["Measure first", "قيس الأول"],
      ["Remember this.", "Measure the memory before you name a bigger machine. A phone is one machine, so this lab is a diagram."],
      ["افتكر كده.", "قيس الذاكرة قبل ما تسمّي جهاز أكبر. والموبايل جهاز واحد، فالمعمل رسم."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["Both ways on paper", "الطريقتين على الورق"],
      ["Try it tonight.", "Compute the wide layer both ways on paper, and check the lab."],
      ["جرّبها الليلة.", "احسب الطبقة العريضة بالطريقتين على الورق، واتأكد من المعمل."],
      ["pencil", "calculator"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Retire the sentence we will use a bigger graphics card.", "Make them compute the memory of the wide layer under both splits before the slogan is allowed."],
      ["أحيّل جملة هنستخدم كارت شاشة أكبر للتقاعد.", "خلّيهم يحسبوا ذاكرة الطبقة العريضة تحت التقسيمين قبل ما الشعار يتسمح."]),
    2: pairScene(
      ["In the seminar: the formula first, weights plus batch times width, then the split. No product name is required."],
      ["في الحلقة: الصيغة الأول، أوزان زائد الدفعة في العرض، وبعدين التقسيم. ومفيش اسم منتج مطلوب."]),
    9: pairScene(
      ["The board has the formula before the lab opens.", "A forecast is not a measurement, and that caution gets one sentence."],
      ["السبورة فيها الصيغة قبل ما المعمل يتفتح.", "والتنبؤ مش قياس، والتحذير ده ياخد جملة واحدة."]),
    12: pairScene(
      ["Try it in your next lecture.", "The first five minutes end on the memory arithmetic, before any product is named."],
      ["جرّبها في محاضرتك الجاية.", "أول خمس دقايق تخلّص على حساب الذاكرة، قبل ما يتسمّى أي منتج."]),
  },
}));

const COURSES = [
  { stu: "ai-d1", lec: "ai-u2", skipStu: new Set([1]), unitS: ["Networks and sequences", "الشبكات والمتسلسلات"], unitT: ["Teaching networks and sequences", "تدريس الشبكات والمتسلسلات"], lessons: L },
  { stu: "ai-d2", lec: "ai-u3", skipStu: new Set(), unitS: ["Vision and generation", "الرؤية والتوليد"], unitT: ["Teaching vision and generation", "تدريس الرؤية والتوليد"], lessons: C2 },
  { stu: "ai-d3", lec: "ai-u4", skipStu: new Set(), unitS: ["Decisions, language and scale", "قرارات ولغة ونطاق"], unitT: ["Teaching decisions, language and scale", "تدريس القرارات واللغة والنطاق"], lessons: C3 },
];

function joinSent(lines) { return lines.join(" "); }

function applyTeach(lessonSpec, teach) {
  if (!teach) return lessonSpec.scenes;
  return lessonSpec.scenes.map((s) => {
    const over = lessonSpec.teach?.[s.n];
    if (!over) return s;
    if (over.en.length !== s.en.length || over.ar.length !== s.ar.length) {
      throw new Error(`${lessonSpec.n} teach scene ${s.n}: sentence count ${over.en.length}/${over.ar.length} vs ${s.en.length}/${s.ar.length}`);
    }
    return { ...s, en: over.en, ar: over.ar };
  });
}

function designOf(s) {
  const screen = { en: s.screen[0], "ar-EG": s.screen[1] };
  const item = (en, ar, icon, sentence) => ({ icon, text: { en, "ar-EG": ar }, s: sentence });
  if (s.design === "cards") {
    const bits = [
      [s.icons[0], s.en[0].split(".")[0]],
    ];
    // Three short labels from the scene's own screen isn't enough. Use the first words of a fixed card set passed via icons length.
    return {
      cards: s.icons.slice(0, 3).map((icon, i) => ({
        icon,
        text: screenCard(s, i),
        s: i === 0 ? 0 : 1,
      })),
      arrows: true,
    };
  }
  if (s.design === "list" || s.design === "steps") {
    const lines = s.en.length === 1 ? [s.en[0], s.en[0]] : s.en;
    const ars = s.ar.length === 1 ? [s.ar[0], s.ar[0]] : s.ar;
    const rows = lines.slice(0, s.design === "steps" ? 3 : 2).map((line, i) => ({
      ...(s.design === "list" ? { icon: s.icons[i] || "check" } : {}),
      text: { en: clip(line), "ar-EG": clip(ars[i] || line) },
      s: Math.min(i, s.en.length - 1),
    }));
    if (s.design === "steps" && rows.length < 3 && s.icons[2]) {
      rows.push({ text: { en: clip(s.screen[0]), "ar-EG": clip(s.screen[1]) }, s: s.en.length - 1 });
    }
    return { [s.design]: rows };
  }
  if (s.design === "recap") {
    return {
      points: [0, 1].map((i) => ({
        icon: i === 0 ? "check" : "spark",
        text: { en: clip(s.en[Math.min(i, s.en.length - 1)]), "ar-EG": clip(s.ar[Math.min(i, s.ar.length - 1)]) },
        s: Math.min(1, s.en.length - 1),
      })),
      takeaway: { en: clip(s.en.at(-1)), "ar-EG": clip(s.ar.at(-1)) },
    };
  }
  if (s.design === "descent") return { who: null, descent: { fn: "x^2", x0: 3, lr: 0.1, steps: 5, xr: [-1, 4], yr: [0, 12], frames: [0, 1] } };
  if (s.design === "arch") return { who: null, arch: { preset: s.arch || "transformer", pass: 1 } };
  if (s.design === "chart") return { who: null, chart: s.chart };
  if (s.design === "compare") return { who: null, compare: s.compare };
  return null;
}

function clip(s) {
  const t = String(s).replace(/[.!?؟]/g, "").trim();
  const words = t.split(/\s+/);
  return words.slice(0, 8).join(" ");
}

function screenCard(s, i) {
  const labels = s.cards || [["One", "واحد"], ["Two", "اتنين"], ["Three", "تلاتة"]];
  const pair = labels[i] || labels.at(-1);
  return { en: pair[0], "ar-EG": pair[1] };
}

// The auto design above is too lossy for on-screen text. Each scene carries `board` explicitly.
function board(s) {
  if (!s.board) return null;
  return s.board;
}

function emit(courseId, unitTitle, lessonSpec, teach) {
  const id = `${courseId}-${lessonSpec.n}`;
  const ID = id.toUpperCase();
  const scenes = applyTeach(lessonSpec, teach);
  for (const s of scenes) for (const icon of s.icons || []) if (!ICONS.has(icon)) throw new Error(`${ID} scene ${s.n}: unknown icon ${icon}`);
  const story = {
    id: ID,
    track: "ai",
    level: 4,
    unit: { number: Number(courseId.replace(/\D/g, "")) || 1, title: unitTitle[0] },
    lesson: { number: lessonSpec.n, title: lessonSpec.title[0], subtitle: lessonSpec.sub[0], minutes: 18, format: "Video + lab + practice" },
    video: {
      title: `${lessonSpec.title[0]}: ${lessonSpec.sub[0]}`,
      length: "2:30",
      format_note: "Animated explainer, 16:9, flat Darsi colours. Narration in the lesson language. Captions are separate files.",
      cast: teach
        ? ["Joseph - computer studies teacher, talking to a fellow lecturer", "Narrator - the Darsi voice, warm and precise, talking to a university lecturer"]
        : ["Joseph - computer studies teacher, talking to a university class", "Narrator - the Darsi voice, warm and precise, talking to a university student"],
      chapters: [
        { at: "0:00", label: lessonSpec.chapters[0][0] },
        { at: "0:26", label: lessonSpec.chapters[1][0] },
        { at: "1:08", label: lessonSpec.chapters[2][0] },
        { at: "2:00", label: lessonSpec.chapters[3][0] },
      ],
      scenes: scenes.map((s, i) => ({
        n: s.n,
        start: ["0:00", "0:16", "0:26", "0:42", "0:56", "1:08", "1:24", "1:32", "1:44", "1:58", "2:06", "2:18"][i],
        end: ["0:16", "0:26", "0:42", "0:56", "1:08", "1:24", "1:32", "1:44", "1:58", "2:06", "2:18", "2:36"][i],
        beat: s.beat,
        visual: "",
        animation: "",
        on_screen_text: s.beat === "Hook" ? "" : s.screen[0],
        voice: s.voice,
        narration: joinSent(s.en),
        ...(s.icons?.length ? { icons: s.icons } : {}),
      })),
      checkpoints: lessonSpec.checks.map((c, i) => ({
        at: i === 0 ? "1:28" : "2:02",
        after_scene: i === 0 ? 7 : 10,
        type: "choice",
        prompt: c.prompt,
        options: c.options.map(([text, correct]) => ({ text, correct })),
        feedback_correct: c.ok,
        feedback_wrong: c.bad,
        resume_at: i === 0 ? "1:32" : "2:06",
      })),
    },
  };
  const ar = {
    title: lessonSpec.title[1],
    subtitle: lessonSpec.sub[1],
    unit: unitTitle[1],
    scenes: Object.fromEntries(scenes.map((s) => [String(s.n), {
      narration: joinSent(s.ar),
      ...(s.beat === "Hook" ? {} : { on_screen_text: s.screen[1] }),
    }])),
    checkpoints: lessonSpec.checks.map((c) => ({
      prompt: c.arPrompt,
      options: c.arOptions,
      feedback_correct: c.arOk,
      feedback_wrong: c.arBad,
    })),
  };
  const design = { scenes: {} };
  for (const s of scenes) {
    const body = s.board;
    if (body) design.scenes[String(s.n)] = body;
  }
  const dir = join(ROOT, "content", "darsi", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(ROOT, "content", "darsi", "source", `${ID}.json`), JSON.stringify(story, null, 2) + "\n");
  writeFileSync(join(dir, "ar-EG.json"), JSON.stringify(ar, null, 2) + "\n");
  writeFileSync(join(dir, "design.json"), JSON.stringify(design, null, 2) + "\n");
  patchChapters(courseId, id, lessonSpec.chapters);
  return ID;
}

function patchChapters(unitId, lessonId, labels) {
  const file = join(DARSI, "content", "units", `${unitId}.json`);
  const unit = JSON.parse(readFileSync(file, "utf8"));
  const lesson = unit.lessons.find((l) => l.id === lessonId);
  const step = lesson.steps.find((s) => s.type === "video");
  step.chapters = labels.map(([en, ar], i) => ({ at: [0, 20, 50, 90][i], atBy: { en: [0, 20, 50, 90][i], ar: [0, 20, 50, 90][i] }, label: { en, ar } }));
  writeFileSync(file, JSON.stringify(unit, null, 2) + "\n");
}

function cards(a, b, c) {
  return { cards: [a, b, c].map((p, i) => ({ icon: p[0], text: { en: p[1], "ar-EG": p[2] }, s: i === 0 ? 0 : 1 })), arrows: true };
}
function rows(kind, items) {
  return { [kind]: items.map((p) => ({ ...(kind === "list" ? { icon: p[0] } : {}), text: { en: p[1], "ar-EG": p[2] }, s: p[3] ?? 0 })) };
}
function recap(a, b, take) {
  return {
    points: [
      { icon: "check", text: { en: a[0], "ar-EG": a[1] }, s: 1 },
      { icon: "spark", text: { en: b[0], "ar-EG": b[1] }, s: 1 },
    ],
    takeaway: { en: take[0], "ar-EG": take[1] },
  };
}

const CARDS = {
  "Loss, descent and backprop": [["calculator", "The loss", "الخسارة"], ["target", "The weights", "الأوزان"], ["arrow", "Make it small", "صغّرها"]],
  "Sequences and the memory that fades": [["arrow", "One symbol", "رمز واحد"], ["chip", "Hidden state", "حالة مخفية"], ["data", "The only memory", "الذاكرة الوحيدة"]],
  "Attention and the transformer": [["target", "A score", "درجة"], ["layers", "A mix", "خليط"], ["arrow", "Weighted sum", "مجموع موزون"]],
  "A picture is a grid of numbers": [["data", "One grid", "شبكة واحدة"], ["layers", "Three for colour", "تلاتة للون"], ["eye", "Brightness", "سطوع"]],
  "Who a detector misses": [["target", "The average", "المتوسط"], ["gauge", "One line", "خط واحد"], ["users", "Every picture", "كل صورة"]],
  "Squeeze and sample": [["target", "The centre", "المركز"], ["spark", "A new blob", "بقعة جديدة"], ["eye", "Not the pixels", "مش البكسلات"]],
  "Adversaries and noise": [["users", "A contest", "منافسة"], ["warning", "It can collapse", "ممكن تنهار"], ["shield", "Not a proof", "مش دليل"]],
  "Learn from reward": [["arrow", "An action", "فعل"], ["gauge", "A late reward", "مكافأة متأخرة"], ["map", "Credit travels", "الفضل يرجع"]],
  "A language model, and changing one": [["layers", "Last layer", "الطبقة الأخيرة"], ["lock", "The rest frozen", "الباقي مجمّد"], ["check", "A few examples", "أمثلة قليلة"]],
  "Laws, tests and a person who can look": [["check", "Test first", "اختبر الأول"], ["eye", "Visible actions", "أفعال ظاهرة"], ["users", "A person", "شخص"]],
  "Science stand-ins, and one machine": [["gauge", "A stand-in", "بديل"], ["shield", "Where it was tested", "حيث اتختبر"], ["check", "Not the measurement", "مش القياس"]],
};

// Attach hand-written boards so on-screen words stay short. Keys are scene numbers.
function attach(list) {
  for (const lessonSpec of list) {
    for (const s of lessonSpec.scenes) {
      const b = lessonSpec.boards?.[s.n];
      if (s.beat === "Hook") { s.board = rows("list", defaultRows(s)); continue; }
      if (b) s.board = b;
      else if (s.design === "descent") s.board = { who: null, descent: { fn: "x^2", x0: 3, lr: 0.1, steps: 5, xr: [-1, 4], yr: [0, 12], frames: [0, 1] } };
      else if (s.design === "arch") s.board = { who: null, arch: { preset: lessonSpec.arch || "transformer", pass: 1 } };
      else if (s.design === "chart" && lessonSpec.title[0].startsWith("A picture")) s.board = {
        who: null,
        chart: { kind: "bar", data: [20, 80, 40], max: 100, s: 0, labels: [{ en: "Left", "ar-EG": "شمال" }, { en: "Middle", "ar-EG": "نص" }, { en: "Right", "ar-EG": "يمين" }], unit: { en: "Brightness", "ar-EG": "السطوع" } },
      };
      else if (s.design === "chart" && lessonSpec.title[0].startsWith("Squeeze")) s.board = {
        who: null,
        chart: { kind: "bar", data: [30, 45], max: 100, s: 0, labels: [{ en: "Across", "ar-EG": "أفقي" }, { en: "Down", "ar-EG": "لتحت" }], unit: { en: "The two-number code", "ar-EG": "الرمز من رقمين" } },
      };
      else if (s.design === "chart" && lessonSpec.n === 3 && lessonSpec.title[0].startsWith("Sequences")) s.board = {
        who: null,
        chart: { kind: "bar", data: [8, 78], max: 100, s: 1, labels: [{ en: "Weak", "ar-EG": "ضعيفة" }, { en: "Strong", "ar-EG": "قوية" }], unit: { en: "Cue left, percent", "ar-EG": "الإشارة الفاضية، في المية" } },
      };
      else if (s.design === "chart") s.board = {
        who: null,
        chart: { kind: "bar", data: [3, 1, 2], max: 4, s: 0, labels: [{ en: "Rebuild", "ar-EG": "إعادة بناء" }, { en: "Contest", "ar-EG": "منافسة" }, { en: "Denoise", "ar-EG": "إزالة ضوضاء" }], unit: { en: "A different loss", "ar-EG": "خسارة مختلفة" } },
      };
      else if (s.design === "compare" && lessonSpec.title[0].startsWith("Who")) s.board = compareBoard(["Close eyes", "عيون قريبة", "In the average", "في المتوسط"], ["Wide face", "وش أعرض", "Below the line", "تحت الخط"]);
      else if (s.design === "compare" && lessonSpec.title[0].startsWith("Learn")) s.board = compareBoard(["Value", "القيمة", "How good a place is", "قد إيه المكان كويس"], ["Policy", "السياسة", "What to do there", "تعمل إيه هناك"]);
      else if (s.design === "compare" && lessonSpec.title[0].startsWith("Laws")) s.board = compareBoard(["Refusals held", "الرفض ممسوك", "The suite can pass", "الاختبار ممكن ينجح"], ["One flipped", "واحد اتقلب", "The suite fails", "الاختبار يفشل"]);
      else if (s.design === "compare" && lessonSpec.title[0].startsWith("Science")) s.board = compareBoard(["Split examples", "قسّم الأمثلة", "Whole layer copied", "الطبقة كلها بتتنسخ"], ["Split the layer", "قسّم الطبقة", "A wide layer fits", "الطبقة العريضة تدخل"]);
      else if (s.design === "cards") s.board = cards(...(CARDS[lessonSpec.title[0]] || defaultCards(s)));
      else if (s.design === "list") s.board = rows("list", defaultRows(s));
      else if (s.design === "steps") s.board = rows("steps", defaultSteps(s));
      else if (s.design === "recap") s.board = recap(
        [clip(s.en[1] || s.en[0]), clip(s.ar[1] || s.ar[0])],
        [clip(s.screen[0]), clip(s.screen[1])],
        [clip(s.en.at(-1)), clip(s.ar.at(-1))],
      );
    }
  }
}

function compareBoard(l, r) {
  const col = (titleEn, titleAr, itemEn, itemAr, icon, tone, sentence) => ({
    title: { en: titleEn, "ar-EG": titleAr }, icon, tone, s: sentence,
    items: [{ icon: "check", text: { en: itemEn, "ar-EG": itemAr }, s: sentence }],
  });
  return { who: null, compare: { left: col(l[0], l[1], l[2], l[3], "target", "accent", 0), right: col(r[0], r[1], r[2], r[3], "warning", "danger", 1) } };
}
function defaultCards(s) {
  const bits = s.screen[0].split(",").map((x) => x.trim());
  const ar = s.screen[1].split("،").map((x) => x.trim());
  const icons = s.icons.length >= 3 ? s.icons : ["check", "arrow", "spark"];
  return [0, 1, 2].map((i) => [icons[i], clip(bits[i] || bits[0]), clip(ar[i] || ar[0])]);
}
function defaultRows(s) {
  return s.en.map((line, i) => [s.icons[i] || "check", clip(line), clip(s.ar[i] || line), Math.min(i, 1)]);
}
function defaultSteps(s) {
  const extra = s.en.length < 3 ? [[s.screen[0], s.screen[1]]] : [];
  const lines = [...s.en.map((line, i) => [clip(line), clip(s.ar[i])]), ...extra.map((p) => [clip(p[0]), clip(p[1])])];
  return lines.slice(0, 3).map((p, i) => ["check", p[0], p[1], Math.min(i, s.en.length - 1)]);
}

for (const group of [L, C2, C3]) attach(group);

const ids = [];
for (const course of COURSES) {
  for (const lessonSpec of course.lessons) {
    if (!course.skipStu.has(lessonSpec.n)) ids.push(emit(course.stu, course.unitS, lessonSpec, false));
    ids.push(emit(course.lec, course.unitT, lessonSpec, true));
  }
}
console.log(ids.join(" "));
