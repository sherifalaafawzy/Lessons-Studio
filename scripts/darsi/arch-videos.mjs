// Writes the university architecture storyboards (except AI-D1-1 and AI-U2-1, written by hand) and the chapter labels in
// the Darsi units (../darsi/content/units: run import-media there afterwards, which times the chapters).
//   node scripts/darsi/arch-videos.mjs
// On-screen lines are whole sentences or hand-written short lines (BOARD, TEACH_BOARD, RECAP); a sentence too long for
// the screen stops the script. The diagrams are in rich-boards.mjs. Re-running it reproduces the files in content/darsi,
// so edit the lessons here, not in their JSON.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { HOOKS, PAPER, RICH } from "./rich-boards.mjs";
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

/** The same check with other options in the lecturer cut, where the two units' checkpoints chose other distractors
 *  (each unit's video checkpoint mirrors its own storyboard's first check). */
function lecOptions(c, options, arOptions) {
  return { ...c, lec: { options, arOptions } };
}

/** Twelve scenes. `teach` replaces scenes for the lecturer cut (1, 2, 9, 12). */
function lesson(spec) {
  return spec;
}

const L = [];

L.push(lesson({
  n: 2, title: ["Loss, descent and backprop", "الخسارة والنزول والانتشار العكسي"], sub: ["The valley and the step", "الوادي والخطوة"],
  chapters: [["The valley", "الوادي"], ["The slope", "الميل", 4], ["One step", "خطوة واحدة", 5], ["Remember", "تذكّر"]],
  checks: [
    // Not the worked step of scene 5 (theta three, a tenth): the learner computes a new one.
    check("The loss is theta squared, theta is two, and the rate is a quarter. Where is theta after one step?",
      [["1", true], ["1.5", false], ["3", false]],
      "Correct: the slope is four, and a quarter of four is one, so theta goes from two to one.",
      "Not quite: the slope of theta squared is two theta, which is four, so theta becomes one.",
      "الخسارة ثيتا تربيع، وثيتا اتنين، والمعدّل ربع. ثيتا بعد خطوة كام؟",
      ["1", "1.5", "3"],
      "صح: الميل أربعة، وربع الأربعة واحد، فثيتا بتنزل من اتنين لواحد.",
      "لأ: ميل ثيتا تربيع هو اتنين في ثيتا، يعني أربعة، فتبقى ثيتا واحد."),
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
      ["Quick check!", "The loss is theta squared, theta is two, and the rate is a quarter. Where is theta after one step?"],
      ["سؤال سريع!", "الخسارة ثيتا تربيع، وثيتا اتنين، والمعدّل ربع. ثيتا بعد خطوة كام؟"]),
    scene(8, "Reveal", "Narrator", ["At 1", "عند 1"],
      ["At one.", "The slope is four, and a quarter of four is one."],
      ["عند واحد.", "الميل أربعة، وربع الأربعة واحد."],
      ["check", "gauge"], "list"),
    scene(9, "Lab preview", "Narrator", ["Gradient descent", "الانحدار التدريجي"],
      // The lab by its title in the app (Labs: "Gradient descent" / «الانحدار التدريجي»).
      ["In the app, open the Gradient descent lab.", "Run a good step, then a step that is too big, and watch the ball."],
      ["في التطبيق، افتح معمل الانحدار التدريجي.", "شغّل خطوة كويسة، وبعدين خطوة كبيرة زيادة، وشوف الكرة."],
      ["gauge", "eye", "warning"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["Why it grows", "ليه بتكبر"],
      ["Your turn.", "The loss grows on every step. What is the most likely cause?"],
      ["دورك.", "الخسارة بتكبر كل خطوة. السبب الأرجح إيه؟"]),
    scene(11, "Recap", "Narrator", ["Slope and step", "الميل والخطوة"],
      ["Remember this.", "The gradient points uphill, and the size of the step decides whether you stay in the valley."],
      ["افتكر كده.", "التدرّج بيشاور لفوق، وحجم الخطوة هو اللي يقرر هتفضل جوه الوادي ولا لأ."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["Write 2.4", "اكتب 2.4"],
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
      ["في حلقة النقاش: الخسارة، والتدرّج، والخطوة اللي طلابك هيغلطوا فيها."]),
    9: pairScene(
      ["Have each pair predict which rate climbs out, then open the Gradient descent lab.", "Collect one wrong prediction and why it was tempting."],
      ["خلّي كل اتنين يتوقعوا أي معدّل هيطلع بره، وبعدين افتح معمل الانحدار التدريجي.", "اجمع توقع غلط واحد، وليه كان مغري."]),
    12: pairScene(
      ["Try it in your next lecture.", "Three rates, five steps by hand, before anyone opens the lab."],
      ["جرّبها في محاضرتك الجاية.", "تلات معدّلات، وخمس خطوات باليد، قبل ما حد يفتح المعمل."],
      ["Three rates by hand", "تلات معدّلات باليد"]),
  },
}));

/** A lecturer's scene: its own sentences, and its own on-screen headline when the student's would not fit them. */
function pairScene(en, ar, screen) { return screen ? { en, ar, screen } : { en, ar }; }

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
    scene(9, "Lab preview", "Narrator", ["A memory that fades", "ذاكرة تخبو"],
      // The lab by its title: "the memory lab" would also name the agents lab «ذاكرة الوكيل».
      ["In the app, open the lab called A memory that fades.", "Find a memory that keeps more than half the cue, and one that keeps almost none."],
      ["في التطبيق، افتح معمل «ذاكرة تخبو».", "دور على ذاكرة تسيب أكتر من نص الإشارة، وواحدة تسيب تقريبًا ولا حاجة."],
      ["gauge", "eye", "target"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["One look?", "نظرة واحدة؟"],
      ["Your turn.", "Does a recurrent net read the whole sequence in one look?"],
      ["دورك.", "الشبكة التكرارية بتقرا المتسلسلة كلها بنظرة واحدة؟"]),
    scene(11, "Recap", "Narrator", ["State, then fade", "حالة، وبعدين خبو"],
      ["Remember this.", "The hidden state is the memory, and a long gap fades it. Attention, next, looks back instead."],
      ["افتكر كده.", "الحالة المخفية هي الذاكرة، والفجوة الطويلة بتخلّيها تخبو. والانتباه، في اللي بعد كده، بيرجع يبص لورا."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["One empty step", "خطوة فاضية"],
      ["Try it on paper tonight.", "Start from a cue of one, keep half, and take one empty step."],
      ["جرّبها على الورق الليلة.", "ابدأ من إشارة واحد، احتفظ بالنص، وخد خطوة فاضية واحدة."],
      ["pencil", "calculator"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Students say the net reads the sentence.", "Point them at the end number with the slider on the left: the sentence is gone."],
      // The Arabic lab's slider runs right to left, so "on the left" would be the strong memory there: say it by its value.
      ["الطلاب بيقولوا إن الشبكة بتقرا الجملة.", "خلّيهم يشاوروا على رقم الآخر والذاكرة قليلة: الجملة راحت."]),
    2: pairScene(
      ["In the seminar: one symbol at a time, and a number that fades before you name vanishing gradients."],
      ["في حلقة النقاش: رمز واحد في كل مرة، ورقم بيخبو قبل ما تسمّي التدرّج المتلاشي."]),
    9: pairScene(
      ["Students write the end number at two slider positions before you name the idea.", "Then they move the slider and correct the prediction."],
      ["الطلاب يكتبوا رقم الآخر عند موضعين للمؤشر قبل ما تسمّي الفكرة.", "وبعدين يحرّكوا المؤشر ويصحّحوا التوقع."]),
    12: pairScene(
      ["Try it in your next lecture.", "Predict the end number, then slide, then correct the prediction."],
      ["جرّبها في محاضرتك الجاية.", "توقّع رقم الآخر، وبعدين حرّك، وبعدين صحّح التوقع."],
      ["Predict, then slide", "توقّع، وبعدين حرّك"]),
  },
}));

L.push(lesson({
  n: 4, title: ["Attention and the transformer", "الانتباه والمحوّل"], sub: ["A mix, not a song", "خليط، مش أغنية"],
  chapters: [["Look back", "بص لورا"], ["The mix", "الخليط"], ["Eight notes", "ثماني نغمات", 9], ["Remember", "تذكّر"]],
  checks: [
    // Every vector the query can see takes part, its own included (the units' checkpoint and reading).
    check("Attention builds a new vector by doing what?",
      [["Taking a weighted sum of the vectors it can see, itself included", true], ["Keeping only the most recent vector", false], ["Adding the vectors with equal weights", false]],
      "Correct: the scores become weights that add to one, and the new vector mixes every vector it can see, its own included.",
      "Not quite: attention takes a weighted sum of every vector it can see, its own included, not only the latest and not all equally.",
      "الانتباه يبني متجه جديد إزاي؟",
      ["بياخد مجموع موزون للمتجهات اللي شايفها، ومعاهم متجهه هو", "بيحتفظ بأحدث متجه بس", "بيجمع المتجهات بأوزان متساوية"],
      "صح: الدرجات بتبقى أوزان مجموعها واحد، والمتجه الجديد بيخلط كل المتجهات اللي شايفها، ومعاهم متجهه هو.",
      "لأ: الانتباه بياخد مجموع موزون لكل المتجهات اللي شايفها، ومعاهم متجهه هو، مش الأحدث بس، ومش كلهم بالتساوي."),
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
    scene(5, "Concept", "Narrator", ["The most common follower", "التابع الأكتر تكرارًا"],
      // The lab by its title, as in scene 9 ("Eight notes" / «ثماني نغمات»).
      ["The Eight notes lab always picks the most common follower.", "A pitch it never saw follow another cannot appear."],
      ["معمل التمان نغمات دايمًا بيختار التابع الأكتر تكرارًا.", "والدرجة اللي عمرها ما شافها جاية بعد درجة تانية مش ممكن تظهر."],
      ["data", "warning"], "list"),
    scene(6, "Examples", "Narrator", ["The block", "الكتلة"],
      ["Here is one transformer block.", "Attention mixes, and the residual adds the original back."],
      // The residual is «الوصلة المتبقية»: «الباقي» reads as "the rest".
      ["دي كتلة محوّل واحدة.", "الانتباه بيخلط، والوصلة المتبقية بترجّع الأصل."],
      ["layers"], "arch"),
    scene(7, "Checkpoint ◆", "Joseph", ["A new vector", "متجه جديد"],
      ["Quick check!", "Attention builds a new vector by doing what?"],
      ["سؤال سريع!", "الانتباه يبني متجه جديد إزاي؟"]),
    scene(8, "Reveal", "Narrator", ["A weighted sum", "مجموع موزون"],
      ["A weighted sum of the vectors it can see, its own included.", "The scores become weights, and the weights do the mixing."],
      ["مجموع موزون للمتجهات اللي شايفها، ومعاهم متجهه هو.", "الدرجات بتبقى أوزان، والأوزان هي اللي بتخلط."],
      ["check", "layers"], "list"),
    scene(9, "Lab preview", "Narrator", ["Eight notes", "ثماني نغمات"],
      ["In the app, open the Eight notes lab.", "Read the tune, then the four notes it writes next, and name one pitch it cannot invent."],
      ["في التطبيق، افتح معمل التمان نغمات.", "اقرأ اللحن، وبعدين الأربع نغمات اللي بيكتبها بعده، وسمّي درجة مش قادر يخترعها."],
      ["data", "eye", "pencil"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["A song?", "أغنية؟"],
      ["Your turn.", "Did those eight notes compose a piece of music?"],
      ["دورك.", "النغمات التمانية دي ألّفت مقطوعة؟"]),
    scene(11, "Recap", "Narrator", ["Mix, then count", "خلط، وبعدين عدّ"],
      ["Remember this.", "Attention mixes, the residual keeps the original, and the eight notes only counted."],
      ["افتكر كده.", "الانتباه بيخلط، والوصلة المتبقية بتحتفظ بالأصل، والتمان نغمات عدّوا بس."],
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
      ["في حلقة النقاش: خليط، ووصلة متبقية، وتمان نغمات لعبة، مش مؤلّف."]),
    9: pairScene(
      ["Before the continuation appears, students say which pitch may follow the last note.", "Then they check the lab."],
      ["قبل ما التكملة تظهر، الطلاب يقولوا أي درجة يجوز تجي بعد النغمة الأخيرة.", "وبعدين يتأكدوا من المعمل."]),
    12: pairScene(
      ["Try it in your next lecture.", "Mark the sentence that separates mixing from understanding."],
      ["جرّبها في محاضرتك الجاية.", "صحّح الجملة اللي بتفصل الخلط عن الفهم."],
      ["Mixing, not understanding", "خلط، مش فهم"]),
  },
}));

// Course 2
const C2 = [];
C2.push(lesson({
  n: 1, title: ["A picture is a grid of numbers", "الصورة شبكة أرقام"], sub: ["A filter mixes neighbours", "المرشّح يخلط الجيران"],
  chapters: [["A grid", "شبكة"], ["A filter", "مرشّح", 4], ["No name", "من غير اسم"], ["Remember", "تذكّر"]],
  checks: [
    check("A grey picture on a computer is which of these?",
      [["A grid of numbers", true], ["A list of object names", false], ["One brightness value for the whole photo", false]],
      "Correct: each cell is a brightness. Colour is three such grids.",
      "Not quite: a grey picture is a grid of numbers.",
      "الصورة الرمادية في الكمبيوتر إيه من دول؟",
      ["شبكة أرقام", "لستة أسماء حاجات", "قيمة سطوع واحدة للصورة كلها"],
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
      ["A three by three filter lies on the picture and multiplies nine cells.", "It writes that sum as the new pixel."],
      ["مرشّح تلاتة في تلاتة بيتحط على الصورة وبيضرب تسع خانات.", "وبيكتب المجموع ده بكسل جديد."],
      ["calculator", "arrow"], "list"),
    scene(5, "Concept", "Narrator", ["Edges, or a blur", "حواف، أو طمس"],
      ["An upright-edge filter lights the sides of walls and doors.", "A blur averages neighbours, and neither knows it is looking at a face."],
      ["مرشّح الحواف القائمة بينوّر جوانب الحيطان والأبواب.", "والطمس بياخد متوسط الجيران، والاتنين مش عارفين إنهم بيبصوا على وش."],
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
    // The lab is «المرشّحات» in Arabic; «الطي» was a third word for convolution (the course says «الالتفاف»).
    scene(9, "Lab preview", "Narrator", ["The convolution lab", "معمل المرشّحات"],
      ["In the app, open the convolution lab.", "Slide an edge filter and a blur, and say what each new picture shows."],
      ["في التطبيق، افتح معمل المرشّحات.", "حرّك مرشّح حواف وطمس، وقول كل صورة جديدة بتبيّن إيه."],
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
      ["في حلقة النقاش: شبكة، وتسع ضربات، ووقفة قبل أي صورة لشخص."]),
    9: pairScene(
      ["Pairs say the nine-term sum out loud once before they run the filter on the whole picture.", "Drawn edges are enough."],
      ["كل اتنين يقولوا مجموع الحدود التسع بصوت عالي مرة قبل ما يشغّلوا المرشّح على الصورة كلها.", "والحواف المرسومة كفاية."]),
    12: pairScene(
      ["Try it in your next lecture.", "Collect the sentence it knows it is a door, and answer it with the nine multiplications."],
      ["جرّبها في محاضرتك الجاية.", "اجمع جملة هو عارف إنه باب، وردّ عليها بالضربات التسع."],
      ["Nine multiplications", "الضربات التسع"]),
  },
}));

C2.push(lesson({
  n: 2, title: ["Who a detector misses", "من يفوّته الكاشف"], sub: ["A face it never trained on", "وش ما اتدرّبش عليه"],
  chapters: [["The average", "المتوسط"], ["The miss", "التفويت"], ["The box", "الصندوق"], ["Remember", "تذكّر"]],
  checks: [
    check("The detector trained on close-set eyes. A wider drawn face scores where?",
      [["Below the line", true], ["Above the line, because it is still a face", false], ["Higher than the training face", false]],
      "Correct: it never saw that spacing, so the match falls under the line.",
      "Not quite: the wider face scores below the line.",
      "الكاشف اتدرّب على عينين قريبين. الوش الأعرض درجته فين؟",
      ["تحت الخط", "فوق الخط، عشان لسه وش", "أعلى من وش التدريب"],
      "صح: عمره ما شاف المسافة دي، فالتطابق بينزل تحت الخط.",
      "لأ: الوش الأعرض درجته تحت الخط."),
    check("Is a high score on the training shape enough to trust a detector on new people?",
      [["No, the test must include who is missed", true], ["Yes, a high score is enough", false], ["Only if the box scores zero", false]],
      "Correct: the wide face is still a face, and the detector missed it.",
      "Not quite: a high score on the training shape hides who is missed.",
      "درجة عالية على شكل التدريب تكفي نثق في كاشف على ناس جداد؟",
      ["لأ، الاختبار لازم يقول مين اتفوّت", "أيوه، الدرجة العالية تكفي", "بس لو الصندوق درجته صفر"],
      "صح: الوش العريض لسه وش، والكاشف فوّته.",
      "لأ: الدرجة العالية على شكل التدريب بتخبّي مين اللي اتفوّت."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["Trained on one spacing", "اتدرّب على مسافة واحدة"],
      ["The detector was trained on drawings with the eyes close together.", "A wider face is still a face, and it was never in that average."],
      ["الكاشف اتدرّب على رسومات عيونها قريبة من بعض.", "الوش الأعرض لسه وش، وعمره ما كان في المتوسط ده."],
      ["eye", "warning"]),
    scene(2, "Title", "Narrator", ["Who is missed", "مين اللي بيتفوّت"],
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
      ["في التطبيق، افتح الكاشف.", "اقرأ درجات الاختبار التلاتة وقول أي وش اتفوّت."],
      ["eye", "gauge", "pencil"], "steps"),
    scene(10, "Checkpoint ◆", "Joseph", ["Enough?", "كفاية؟"],
      ["Your turn.", "Is a high score on the training shape enough to trust a detector on new people?"],
      ["دورك.", "درجة عالية على شكل التدريب تكفي نثق في كاشف على ناس جداد؟"]),
    scene(11, "Recap", "Narrator", ["Name the miss", "سمّي التفويت"],
      ["Remember this.", "Report who was missed. Do not test a face detector on real photographs of people."],
      ["افتكر كده.", "اذكر مين اللي اتفوّت. ومتختبرش كاشف وشوش على صور حقيقية لناس."],
      [], "recap"),
    scene(12, "Try it tomorrow", "Narrator", ["The wide score", "درجة العريض"],
      ["Try it tonight.", "Write the line and the wide face's score from the lab."],
      ["جرّبها الليلة.", "اكتب الخط ودرجة الوش العريض من المعمل."],
      ["pencil", "gauge"], "list"),
  ],
  teach: {
    1: pairScene(
      ["Do not assign classmates' photos.", "The drawn set is the seminar, and the mark is a sentence: who was missed."],
      ["متكلّفش بصور الزملاء.", "المجموعة المرسومة هي حلقة النقاش، والتصحيح جملة: مين اللي اتفوّت."]),
    2: pairScene(
      ["In the seminar: one average, one line, and a miss you make them write before any real system."],
      ["في حلقة النقاش: متوسط واحد، وخط واحد، وتفويت تخليهم يكتبوه قبل أي نظام حقيقي."]),
    9: pairScene(
      ["Students write the miss in one sentence before you discuss a real detector.", "If someone opens a camera roll, stop the exercise."],
      ["الطلاب يكتبوا التفويت في جملة واحدة قبل ما تناقش كاشف حقيقي.", "ولو حد فتح ألبوم الكاميرا، وقف التمرين."]),
    12: pairScene(
      ["Try it in your next lecture.", "Add one line to the lab sheet: photographs of people are out of scope."],
      ["جرّبها في محاضرتك الجاية.", "ضيف سطر على ورقة المعمل: صور الناس خارج النطاق."],
      ["No photos of people", "مفيش صور لناس"]),
  },
}));

C2.push(lesson({
  n: 3, title: ["Squeeze and sample", "اضغط ثم خذ عيّنة"], sub: ["Two numbers, not the pixels", "رقمين، مش البكسلات"],
  chapters: [["The code", "الرمز"], ["A nudge", "تحريك", 4], ["Not a photo", "مش صورة", 5], ["Remember", "تذكّر"]],
  checks: [
    check("The two-number code of the blob is which of these?",
      [["Where the brightness sits", true], ["The name of the object", false], ["Every pixel, packed tightly", false]],
      "Correct: encoding takes the centre of the brightness. Decoding paints a blob there.",
      "Not quite: the two numbers are where the brightness sits.",
      "رمز البقعة اللي من رقمين هو إيه من دول؟",
      ["موضع السطوع", "اسم الحاجة", "كل البكسلات، متضغوطة جامد"],
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
      ["في حلقة النقاش: مؤشر، وفرق بيكبر، وجملة ممنوعة عن الفهم."]),
    9: pairScene(
      ["Ask for the sentence before the slider moves, and again after.", "The mark is that the nudged decode is new, not repaired."],
      ["اطلب الجملة قبل ما المؤشر يتحرك، ومرة كمان بعده.", "والتصحيح إن الفك المتحرّك جديد، مش متصلح."]),
    12: pairScene(
      ["Try it in your next lecture.", "Bring one forbidden sentence and have them repair it."],
      ["جرّبها في محاضرتك الجاية.", "هات جملة ممنوعة وخليهم يصلّحوها."],
      ["Repair a banned sentence", "صلّحوا جملة ممنوعة"]),
  },
}));

C2.push(lesson({
  n: 4, title: ["Adversaries and noise", "خصمان وضوضاء"], sub: ["One step is not a picture", "خطوة واحدة مش صورة"],
  chapters: [["Three ideas", "تلات أفكار"], ["One step", "خطوة واحدة", 4], ["Not evidence", "مش دليل", 10], ["Remember", "تذكّر"]],
  checks: [
    lecOptions(check("Which idea removes a little noise at a time?",
      [["Diffusion", true], ["A GAN generator, in one pass", false], ["A single 3×3 edge filter", false]],
      "Correct: diffusion repeats a small denoise. One step in the lab is the idea, not a finished generator.",
      "Not quite: diffusion is the idea that removes a little noise at a time.",
      "أي فكرة بتشيل شوية ضوضاء في كل مرة؟",
      ["الانتشار", "مولّد الشبكة الخصمية (GAN)، في خطوة واحدة", "مرشّح حواف واحد تلاتة في تلاتة"],
      "صح: الانتشار بيكرّر إزالة ضوضاء صغيرة. والخطوة في المعمل هي الفكرة، مش مولّد خلصان.",
      "لأ: الانتشار هو الفكرة اللي بتشيل شوية ضوضاء في كل مرة."),
      [["Diffusion", true], ["A single 3×3 edge filter", false], ["A GAN’s discriminator", false]],
      ["الانتشار", "مرشّح حواف واحد تلاتة في تلاتة", "المميِّز في الشبكة الخصمية (GAN)"]),
    check("Is a picture from a generator evidence of what it shows?",
      [["No, it is a sample and it can be false", true], ["Yes, if it looks sharp", false], ["Only when the noise is low", false]],
      "Correct: it is a sample from a model trained to lower a loss. It can look convincing and still be false.",
      "Not quite: a generated picture is not evidence of what it shows.",
      "صورة من مولّد دليل على اللي بتبيّنه؟",
      ["لأ، عيّنة وممكن تبقى غلط", "أيوه، لو شكلها حاد", "بس لما الضوضاء قليلة"],
      "صح: دي عيّنة من نموذج اتدرّب يقلّل خسارة. وممكن تبان مقنعة وهي غلط.",
      "لأ: الصورة المتولّدة مش دليل على اللي بتبيّنه."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["Three ways to invent", "تلات طرق للاختراع"],
      ["Three ideas invent a picture.", "One rebuilds from a code, one tries to fool a judge, and one removes a little noise at a time."],
      ["تلات أفكار بيخترعوا صورة.", "واحد بيعيد البناء من رمز، وواحد بيحاول يخدع مميِّز، وواحد بيشيل شوية ضوضاء في كل مرة."],
      ["spark", "users", "gauge"]),
    scene(2, "Title", "Narrator", ["A contest and a step", "منافسة وخطوة"],
      ["Today: a contest, a denoise step, and why one step is not a finished picture."],
      ["النهارده: منافسة، وخطوة تشيل الضوضاء، وليه الخطوة الواحدة مش صورة خلصانة."]),
    scene(3, "Definition", "Narrator", ["Inventor and judge", "مخترع ومميِّز"],
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
      ["في حلقة النقاش: إعادة بناء، ومنافسة، وإزالة ضوضاء، وعيّنة مش هتصحّحها كدليل."]),
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
  chapters: [["Late credit", "فضل متأخر"], ["Two pictures", "صورتين", 4], ["A bad reward", "مكافأة وحشة", 5], ["Remember", "تذكّر"]],
  checks: [
    lecOptions(check("A reward arrives after a path of actions. The hard part is which of these?",
      [["Sending the credit back along the path", true], ["Making the reward at the charger bigger", false], ["Picking a random move on every square", false]],
      "Correct: the earlier steps have to learn that they helped.",
      "Not quite: the hard part is sending the credit back along the path.",
      "المكافأة بتوصل بعد مسار من الأفعال. الجزء الصعب إيه من دول؟",
      ["رجوع الفضل على طول المسار", "تكبير المكافأة عند الشاحن", "اختيار حركة عشوائية في كل مربع"],
      "صح: الخطوات الأولى لازم تتعلّم إنها ساعدت.",
      "لأ: الجزء الصعب هو رجوع الفضل على طول المسار."),
      [["Sending the credit back along the path", true], ["Making the final reward bigger", false], ["Giving every step the same reward", false]],
      ["رجوع الفضل على طول المسار", "تكبير المكافأة الأخيرة", "إن كل خطوة تاخد نفس المكافأة"]),
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
      ["خلّي الطلاب يخترعوا مكافأة شكلها كويس وبتكسر المهمة.", "وبعدين افصل صورة القيمة عن صورة السياسة على السبورة."]),
    2: pairScene(
      ["In the seminar: late credit, two words you will not let them swap, and a reward that backfires."],
      ["في حلقة النقاش: فضل متأخر، وكلمتين مش هتسيبهم يبدّلوهم، ومكافأة بترتد."]),
    9: pairScene(
      ["Two columns on the board: value, and policy.", "Students fill one row from the lab before you discuss a real system."],
      ["عمودين على السبورة: القيمة، والسياسة.", "والطلاب يملوا صف واحد من المعمل قبل ما تناقش نظام حقيقي."]),
    12: pairScene(
      ["Try it in your next lecture.", "Bring the wrong reward before the lab, and mark any paragraph that treats the two words as synonyms."],
      ["جرّبها في محاضرتك الجاية.", "هات المكافأة الغلط قبل المعمل، وصحّح أي فقرة بتتعامل مع الكلمتين كمرادف."]),
  },
}));

C3.push(lesson({
  // The teach lab (Darsi Tiny) trains its top decoder block; the embedding and the output layer stay frozen, so the
  // part that learns is "the top block", never "the last layer". Token is «توكن», fine-tuning «الضبط الدقيق» and a block
  // «كتلة» («الكتلة اللي فوق»), never «البلوك» or «التعديل الدقيق» (docs/curriculum/ar-lingo.md).
  n: 2, title: ["A language model, and changing one", "نموذج لغوي، وتغييره"], sub: ["Only the top block", "الكتلة اللي فوق بس"],
  chapters: [["Next token", "التوكن الجاي"], ["Frozen", "مجمّد"], ["An old skill", "مهارة قديمة", 5], ["Remember", "تذكّر"]],
  checks: [
    lecOptions(check("Fine-tuning, in the small lab, changes which of these?",
      [["The top block, on a few examples", true], ["Every weight in the model, on the same few examples", false], ["The embedding of each token", false]],
      "Correct: the rest stays frozen. That is the honest small version.",
      "Not quite: the small lab changes the top block, on a few examples.",
      "الضبط الدقيق، في المعمل الصغير، بيغيّر إيه من دول؟",
      ["الكتلة اللي فوق، على أمثلة قليلة", "كل وزن في النموذج، على نفس الأمثلة القليلة", "تضمين كل توكن"],
      "صح: الباقي بيفضل مجمّد. ودي النسخة الصغيرة الصادقة.",
      "لأ: المعمل الصغير بيغيّر الكتلة اللي فوق، على أمثلة قليلة."),
      [["The top block, on a few examples", true], ["Every weight, starting again from random numbers", false], ["Only the list of words the model knows", false]],
      ["الكتلة اللي فوق، على أمثلة قليلة", "كل الأوزان، من الأول بأرقام عشوائية", "لستة الكلمات اللي النموذج يعرفها بس"]),
    check("Does a language model look facts up as it writes?",
      [["No, it guesses the next token", true], ["Yes, it searches a library", false], ["Yes, it rereads its training data", false]],
      "Correct: it guesses the next token from patterns, unless a separate tool searches.",
      "Not quite: a language model guesses the next token. It does not look facts up.",
      "النموذج اللغوي بيدوّر على الحقائق وهو بيكتب؟",
      ["لأ، بيخمّن التوكن الجاي", "أيوه، بيدوّر في مكتبة", "أيوه، بيقرا بيانات التدريب تاني"],
      "صح: بيخمّن التوكن الجاي من الأنماط، إلا لو أداة لوحدها دوّرت.",
      "لأ: النموذج اللغوي بيخمّن التوكن الجاي. ومش بيدوّر على حقائق."),
  ],
  scenes: [
    scene(1, "Hook", "Joseph", ["A guess, not a lookup", "تخمين، مش بحث"],
      ["A language model guesses the next token from patterns.", "It does not look facts up, unless a separate tool searches."],
      ["النموذج اللغوي بيخمّن التوكن الجاي من الأنماط.", "ومش بيدوّر على حقائق، إلا لو أداة لوحدها دوّرت."],
      ["bot", "warning"]),
    scene(2, "Title", "Narrator", ["What moved", "إيه اللي اتحرّك"],
      ["Today: what fine-tuning changes in the small lab, and what stays frozen."],
      ["النهارده: الضبط الدقيق في المعمل الصغير بيغيّر إيه، وإيه اللي بيفضل مجمّد."]),
    scene(3, "Definition", "Narrator", ["Top block only", "الكتلة اللي فوق بس"],
      ["The small fine-tune teaches only the top block, on a few examples.", "The rest of the weights do not move."],
      ["الضبط الدقيق المصغَّر بيعلّم الكتلة اللي فوق بس، على أمثلة قليلة.", "وباقي الأوزان مش بتتحرك."],
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
      ["Here the lower blocks stay still.", "Only the top block is allowed to change."],
      ["هنا الكتل اللي تحت بتفضل ثابتة.", "والكتلة اللي فوق بس مسموح لها تتغيّر."],
      ["layers"], "arch"),
    scene(7, "Checkpoint ◆", "Joseph", ["What changes?", "إيه بيتغيّر؟"],
      ["Quick check!", "Fine-tuning, in the small lab, changes which of these?"],
      ["سؤال سريع!", "الضبط الدقيق، في المعمل الصغير، بيغيّر إيه من دول؟"]),
    scene(8, "Reveal", "Narrator", ["The top block", "الكتلة اللي فوق"],
      ["The top block, on a few examples.", "The rest stays frozen."],
      ["الكتلة اللي فوق، على أمثلة قليلة.", "والباقي بيفضل مجمّد."],
      ["check", "lock"], "list"),
    scene(9, "Lab preview", "Narrator", ["The teach lab", "معمل التعليم"],
      ["In the app, open the teach lab.", "Teach the top block a new job, and name one old answer you would now check."],
      ["في التطبيق، افتح معمل التعليم.", "علّم الكتلة اللي فوق مهمة جديدة، وسمّي إجابة قديمة هتراجعها دلوقتي."],
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
      ["فقرة بتقول عملنا ضبط دقيق للنموذج، من غير ما تسمّي طبقة، ناقصة.", "والجزء المجمّد لازم يبقى ظاهر."]),
    2: pairScene(
      ["In the seminar: next token, a frozen stack, and a rubric line that unnamed weights score zero."],
      ["في حلقة النقاش: التوكن الجاي، وكومة مجمّدة، وسطر في المعيار إن الأوزان اللي من غير اسم درجتها صفر."]),
    9: pairScene(
      ["Mark only write-ups that name the frozen layers.", "Warn that a confident rewrite of an old fact is the crowding, not a feature."],
      ["متصحّحش غير الكتابات اللي بتسمّي الطبقات المجمّدة.", "وحذّر إن إعادة كتابة واثقة لحقيقة قديمة هي المزاحمة، مش ميزة."]),
    12: pairScene(
      ["Try it in your next lecture.", "Three answers that say the model was fine-tuned, and the same reason each scores zero."],
      ["جرّبها في محاضرتك الجاية.", "تلات إجابات بتقول إن النموذج اتعمله ضبط دقيق، ونفس السبب لكل واحدة درجتها صفر."],
      ["Why each scores zero", "ليه كل واحدة صفر"]),
  },
}));

C3.push(lesson({
  n: 3, title: ["Laws, tests and a person who can look", "قوانين واختبارات وشخص يستطيع أن يرى"], sub: ["One missed refusal", "رفض فائت واحد"],
  chapters: [["Three duties", "تلات واجبات"], ["A refusal", "رفض", 4], ["One miss", "خطأ واحد"], ["Remember", "تذكّر"]],
  checks: [
    lecOptions(check("A model scores perfectly on its training cases and answers a case it should refuse. What happens to the suite?",
      [["It has not passed", true], ["It has passed, since every training case was right", false], ["It passes if the average score is high enough", false]],
      "Correct: one missed refusal fails the suite. The other scores do not cancel it.",
      "Not quite: the suite has not passed.",
      "النموذج نجح تمام في حالات تدريبه ورد على حالة كان لازم يرفضها. الاختبار عمل إيه؟",
      ["ما نجحش", "نجح، عشان كل حالات التدريب صح", "بينجح لو متوسط الدرجات عالي كفاية"],
      "صح: رفض فائت واحد بيفشل الاختبار. والدرجات التانية مش بتلغيه.",
      "لأ: الاختبار ما نجحش."),
      [["It has not passed", true], ["It has passed", false], ["It needs no refusal cases", false]],
      ["ما نجحش", "نجح", "مش محتاج حالات رفض"]),
    check("Which duty does a missed refusal break first?",
      [["Test before use", true], ["Keep the actions visible", false], ["Keep a person responsible", false]],
      "Correct: a test before use includes the case the model must refuse.",
      "Not quite: the first duty is to test before use, refusals included.",
      "الرفض الفائت بيكسر أي واجب الأول؟",
      ["الاختبار قبل الاستعمال", "الأفعال الظاهرة", "شخص مسؤول"],
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
      ["Quick check!", "A model scores perfectly on its training cases and answers a case it should refuse. What happens to the suite?"],
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
      ["في حلقة النقاش: سطر واحد في المعيار. الرفض الفائت رسوب، مهما كانت الدرجة التانية."]),
    9: pairScene(
      ["Put that line on the rubric before the lab, not after someone celebrates a score.", "Connect it in one sentence to the detector that missed the wide face."],
      ["حط السطر ده في المعيار قبل المعمل، مش بعد ما حد يحتفل بدرجة.", "وصِله في جملة واحدة بالكاشف اللي فوّت الوش العريض."]),
    12: pairScene(
      ["Try it in your next lecture.", "Three student claims of a high score with no refusal, and the one line that fails all three."],
      ["جرّبها في محاضرتك الجاية.", "تلات ادّعاءات طلاب بدرجة عالية من غير رفض، والسطر الواحد اللي يفشل التلاتة."],
      ["Three claims, one line", "تلات ادّعاءات، وسطر واحد"]),
  },
}));

C3.push(lesson({
  n: 4, title: ["Science stand-ins, and one machine", "بدائل علمية، وجهاز واحد"], sub: ["Split the layer when it is wide", "قسّم الطبقة لما تبقى عريضة"],
  chapters: [["A stand-in", "بديل"], ["Memory", "الذاكرة", 4], ["Two splits", "تقسيمين", 5], ["Remember", "تذكّر"]],
  checks: [
    check("A layer does not fit on one machine because it is wide. What do you do?",
      [["Split the layer", true], ["Only split the examples", false], ["Use a bigger batch", false]],
      "Correct: splitting the examples still copies the whole layer onto each machine.",
      "Not quite: a wide layer needs the layer itself split.",
      "طبقة مش داخلة على جهاز واحد لأنها عريضة. تعمل إيه؟",
      ["تقسّم الطبقة", "تقسّم الأمثلة بس", "تستخدم دفعة أكبر"],
      "صح: تقسيم الأمثلة لسه بينسخ الطبقة كلها على كل جهاز.",
      "لأ: الطبقة العريضة محتاجة الطبقة نفسها تتقسم."),
    check("Is a fast stand-in for a lab measurement the experiment itself?",
      [["No, it is not the measurement", true], ["Yes, if it is fast", false], ["Yes, once it agrees with the lab", false]],
      "Correct: it is useful where it was tested. It is not the measurement.",
      "Not quite: a stand-in is not the experiment.",
      "البديل السريع لقياس معملي هو التجربة نفسها؟",
      ["لأ، مش القياس", "أيوه، لو سريع", "أيوه، لو اتفق مع المعمل"],
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
    scene(4, "Concept", "Narrator", ["What one step stores", "الخطوة بتخزّن إيه"],
      ["One training step stores the weights, their gradients, the optimiser's state and the activations.", "Activations grow with the batch and with the width."],
      ["خطوة التدريب الواحدة بتخزّن الأوزان، وتدرّجاتها، وحالة المحسِّن، والتنشيطات.", "والتنشيطات بتكبر مع الدفعة ومع العرض."],
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
      ["طلّع جملة «هنستخدم كارت شاشة أكبر» على المعاش.", "خلّيهم يحسبوا ذاكرة الطبقة العريضة تحت التقسيمين قبل ما الشعار يتسمح."]),
    2: pairScene(
      ["In the seminar: the formula first, weights plus batch times width, then the split. No product name is required."],
      ["في حلقة النقاش: الصيغة الأول، أوزان زائد الدفعة في العرض، وبعدين التقسيم. ومفيش اسم منتج مطلوب."]),
    9: pairScene(
      ["The board has the formula before the lab opens.", "A forecast is not a measurement, and that caution gets one sentence."],
      ["السبورة فيها الصيغة قبل ما المعمل يتفتح.", "والتنبؤ مش قياس، والتحذير ده ياخد جملة واحدة."]),
    12: pairScene(
      ["Try it in your next lecture.", "The first five minutes end on the memory arithmetic, before any product is named."],
      ["جرّبها في محاضرتك الجاية.", "أول خمس دقايق تخلّص على حساب الذاكرة، قبل ما يتسمّى أي منتج."],
      ["Memory first", "الذاكرة الأول"]),
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
    return { ...s, en: over.en, ar: over.ar, ...(over.screen ? { screen: over.screen } : {}) };
  });
}

/** A scene's narration as the converter hears it: one entry per sentence (".", "!", "?", "؟" or "…" ends one). */
function sentencesOf(lines) {
  return lines.join(" ").match(/[^.!?؟…]+[.!?؟…]+["»”]?|[^.!?؟…]+$/gu)?.map((x) => x.trim()).filter(Boolean) ?? [];
}

/** On-screen words from a narration sentence: the whole sentence, without its full stop, when it has at most `max`
 *  words. Never part of a sentence, and never two run together: a sentence that is too long needs a short line written
 *  for it (BOARD, TEACH_BOARD and RECAP below), and the generator stops until it has one. */
function clip(sentence, max, where) {
  const t = String(sentence).trim().replace(/[.!?؟…]+["»”]?$/u, "").trim();
  if (/[.!?؟…]\s/u.test(t)) throw new Error(`${where}: "${sentence}" is two sentences; write one short line for the screen`);
  if (t.split(/\s+/).length > max) throw new Error(`${where}: "${sentence}" is over ${max} words; write a short line for the screen`);
  return t;
}

/** Where each lesson's right answers sit (0 = A), for its two quick checks. The player shows options in the order
 *  written and never shuffles, so a check whose answer is always A teaches the learner to tap A. */
const ANSWER_AT = {
  "Loss, descent and backprop": [2, 1],
  "Sequences and the memory that fades": [1, 2],
  "Attention and the transformer": [2, 1],
  "A picture is a grid of numbers": [1, 2],
  "Who a detector misses": [2, 1],
  "Squeeze and sample": [1, 2],
  "Adversaries and noise": [2, 1],
  "Learn from reward": [1, 2],
  "A language model, and changing one": [2, 1],
  "Laws, tests and a person who can look": [1, 2],
  "Science stand-ins, and one machine": [2, 1],
};

/** The check with its right answer moved to option `at`, in both languages. */
function place(c, at, where) {
  const i = c.options.findIndex(([, ok]) => ok);
  if (i < 0 || c.options.filter(([, ok]) => ok).length !== 1) throw new Error(`${where}: a check needs exactly one right answer`);
  if (c.arOptions.length !== c.options.length) throw new Error(`${where}: ${c.options.length} English options, ${c.arOptions.length} Arabic`);
  const move = (list) => { const out = list.filter((_, k) => k !== i); out.splice(at, 0, list[i]); return out; };
  return { ...c, options: move(c.options), arOptions: move(c.arOptions) };
}

const SCENE_START = ["0:00", "0:16", "0:26", "0:42", "0:56", "1:08", "1:24", "1:32", "1:44", "1:58", "2:06", "2:18"];

function emit(courseId, unitTitle, lessonSpec, teach) {
  const id = `${courseId}-${lessonSpec.n}`;
  const ID = id.toUpperCase();
  const scenes = applyTeach(lessonSpec, teach);
  const at = ANSWER_AT[lessonSpec.title[0]];
  if (!at || at.length !== lessonSpec.checks.length) throw new Error(`${ID}: say where its right answers sit in ANSWER_AT`);
  const checks = lessonSpec.checks.map((c, i) => place(teach && c.lec ? { ...c, ...c.lec } : c, at[i], `${ID} check ${i + 1}`));
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
      // A chapter starts on scene 1, 3, 6 and 11 (the summary), unless its label names the scene it starts on: a
      // time that is no scene's start puts the chapter at the next scene in Darsi (import-media).
      chapters: lessonSpec.chapters.map(([label, , sceneN], i) => ({ at: SCENE_START[(sceneN ?? [1, 3, 6, 11][i]) - 1], label })),
      scenes: scenes.map((s, i) => ({
        n: s.n,
        start: SCENE_START[i],
        end: ["0:16", "0:26", "0:42", "0:56", "1:08", "1:24", "1:32", "1:44", "1:58", "2:06", "2:18", "2:36"][i],
        beat: s.beat,
        visual: "",
        animation: "",
        on_screen_text: s.beat === "Hook" ? "" : s.screen[0],
        voice: s.voice,
        narration: joinSent(s.en),
        ...(s.icons?.length ? { icons: s.icons } : {}),
      })),
      checkpoints: checks.map((c, i) => ({
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
    checkpoints: checks.map((c) => ({
      prompt: c.arPrompt,
      options: c.arOptions,
      feedback_correct: c.arOk,
      feedback_wrong: c.arBad,
    })),
  };
  for (const c of story.video.chapters) {
    if (!story.video.scenes.some((s) => s.start === c.at)) throw new Error(`${ID}: chapter "${c.label}" at ${c.at} starts no scene`);
  }
  const design = { scenes: {} };
  for (const s of scenes) {
    const studentOnly = !teach && (s.n === 1 ? HOOKS[lessonSpec.title[0]] : s.n === 12 ? PAPER[lessonSpec.title[0]] : null);
    // The lecturer's own scenes (1, 9, 12) show the lecturer's words, never the student's task.
    const body = teach && lessonSpec.teach?.[s.n] ? s.teachBoard : studentOnly || s.board;
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
/** Throws when a hand-written screen line is longer than its body allows (README "design.json"), in either language. */
function short(text, max, where) {
  for (const t of text) {
    const n = String(t).trim().split(/\s+/).length;
    if (n > max) throw new Error(`${where}: "${t}" has ${n} words; at most ${max} fit`);
  }
}
function checkTables() {
  for (const [table, name] of [[BOARD, "BOARD"], [TEACH_BOARD, "TEACH_BOARD"]]) {
    for (const [title, byScene] of Object.entries(table)) {
      for (const [n, items] of Object.entries(byScene)) {
        const steps = Number(n) === 9;
        for (const p of items) short([p[1], p[2]], steps ? 8 : 9, `${name} ${title} scene ${n}`);
        if (items.length < 2 || items.length > (steps ? 4 : 5)) throw new Error(`${name} ${title} scene ${n}: ${items.length} rows`);
      }
    }
  }
  for (const [title, r] of Object.entries(RECAP)) {
    for (const p of r.points) short([p[0], p[1]], 6, `RECAP ${title}`);
    short(r.takeaway, 12, `RECAP ${title} takeaway`);
  }
}
/** Rows of [icon, en, ar, sentence, offset in seconds]; steps have no icon. */
function rows(kind, items) {
  return { [kind]: items.map((p) => ({ ...(kind === "list" ? { icon: p[0] } : {}), text: { en: p[1], "ar-EG": p[2] }, s: p[3] ?? 0, ...(p[4] ? { o: p[4] } : {}) })) };
}
/** The summary: points of [en, ar, sentence] and one closing line. */
function recap(title) {
  const r = RECAP[title];
  if (!r) throw new Error(`${title}: write its summary in RECAP`);
  return {
    points: r.points.map((p, i) => ({ icon: i === 0 ? "check" : "spark", text: { en: p[0], "ar-EG": p[1] }, s: p[2] })),
    takeaway: { en: r.takeaway[0], "ar-EG": r.takeaway[1] },
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
  "A language model, and changing one": [["layers", "Top block", "الكتلة اللي فوق"], ["lock", "The rest frozen", "الباقي مجمّد"], ["check", "A few examples", "أمثلة قليلة"]],
  "Laws, tests and a person who can look": [["check", "Test first", "اختبر الأول"], ["eye", "Visible actions", "أفعال ظاهرة"], ["users", "A person", "شخص"]],
  "Science stand-ins, and one machine": [["gauge", "A stand-in", "بديل"], ["shield", "Where it was tested", "مكان ما اتختبر"], ["check", "Not the measurement", "مش القياس"]],
};

// Short lines for the screen where a narration sentence is too long to show whole (clip refuses it): each line is
// complete, never the first words of a sentence. Rows are [icon, en, ar, sentence, offset in seconds]; steps (scene 9)
// ignore the icon. A list row has at most 9 words, a step 8.
const BOARD = {
  "Loss, descent and backprop": {
    9: [["", "In the app, open Gradient descent", "في التطبيق، افتح «الانحدار التدريجي»", 0], ["", "Run Good, then Too big", "شغّل «مناسبة»، وبعدين «كبيرة جدًا»", 1], ["", "Watch where the ball goes", "شوف الكرة بتروح فين", 1]],
  },
  "Sequences and the memory that fades": {
    5: [["check", "Near one, the cue's sign survives", "قرب الواحد، علامة الإشارة بتفضل", 0], ["arrow", "A long gap washes the start away", "الفجوة الطويلة بتمسح البداية", 1]],
    8: [["warning", "Almost none of the cue", "تقريبًا ولا حاجة من الإشارة", 0], ["check", "Multiplied again and again, the cue washes away", "بتتضرب مرة ورا مرة، والإشارة بتتمسح", 1]],
    9: [["", "In the app, open A memory that fades", "في التطبيق، افتح «ذاكرة تخبو»", 0], ["", "Find a memory keeping over half the cue", "دوّر على ذاكرة تسيب أكتر من نص الإشارة", 1], ["", "Then one that keeps almost none", "وواحدة تسيب تقريبًا ولا حاجة", 1]],
  },
  "Attention and the transformer": {
    5: [["data", "It always picks the most common follower", "دايمًا بيختار التابع الأكتر تكرارًا", 0], ["warning", "A pair it never counted cannot appear", "الزوج اللي ما اتعدّش مش ممكن يظهر", 1]],
    8: [["check", "A weighted sum of every vector it can see", "مجموع موزون لكل المتجهات اللي شايفها", 0], ["layers", "Scores become weights; the weights mix", "الدرجات بتبقى أوزان، والأوزان بتخلط", 1]],
    9: [["", "In the app, open Eight notes", "في التطبيق، افتح «ثماني نغمات»", 0], ["", "Read the tune and the next four notes", "اقرأ اللحن والأربع نغمات اللي بعده", 1], ["", "Name a pitch it cannot invent", "سمّي درجة مش قادر يخترعها", 1]],
    12: [["pencil", "Try it tonight", "جرّبها الليلة", 0], ["file", "Write what was counted, and what was not", "اكتب اللي اتعدّ، واللي ما اتعدّش", 1]],
  },
  "A picture is a grid of numbers": {
    5: [["eye", "Upright edges: the sides of walls and doors", "الحواف القائمة: جوانب الحيطان والأبواب", 0], ["warning", "A blur averages; neither one sees a face", "والطمس بياخد المتوسط، ومحدش فيهم شايف وش", 1]],
    9: [["", "In the app, open the convolution lab", "في التطبيق، افتح معمل المرشّحات", 0], ["", "Slide an edge filter, then a blur", "حرّك مرشّح حواف، وبعدين طمس", 1], ["", "Say what each new picture shows", "قول كل صورة جديدة بتبيّن إيه", 1]],
  },
  "Who a detector misses": {
    5: [["shield", "Testing only the training shape hides the miss", "الاختبار على شكل التدريب بس بيخبّي التفويت", 0], ["warning", "These are drawings, not anyone's photograph", "ودي رسومات، مش صورة أي شخص", 1]],
    9: [["", "In the app, open the detector", "في التطبيق، افتح الكاشف", 0], ["", "Read the three test scores", "اقرأ درجات الاختبار التلاتة", 1], ["", "Say which face was missed", "وقول أي وش اتفوّت", 1]],
    12: [["pencil", "Try it tonight", "جرّبها الليلة", 0], ["gauge", "Write the line and the wide face's score", "اكتب الخط ودرجة الوش العريض", 1]],
  },
  "Squeeze and sample": {
    4: [["check", "Leave the code: the decode is close", "سيب الرمز: الفك بيبقى قريب", 0], ["warning", "Move it and you invent a new blob", "حرّكه وهتخترع بقعة جديدة", 1]],
    5: [["file", "Two numbers summarise this brightness", "الرقمين ملخّص للسطوع ده", 0], ["shield", "Not a map of meaning, not a photo", "مش خريطة معنى، ومش صورة فوتوغرافية", 1]],
    9: [["", "In the app, open the code lab", "في التطبيق، افتح معمل الرمز", 0], ["", "Leave the sliders, then move one", "سيب المؤشرات، وبعدين حرّك واحد", 1], ["", "Say when the decode stopped being a rebuild", "قول امتى الفك بطّل يبقى إعادة بناء", 1]],
    12: [["pencil", "Try it tonight", "جرّبها الليلة", 0], ["calculator", "Write both codes and the difference", "اكتب الرمزين والفرق بينهم", 1]],
  },
  "Adversaries and noise": {
    1: [["spark", "Rebuild from a code", "إعادة بناء من رمز", 1], ["users", "Fool a judge", "خداع المميِّز", 1], ["gauge", "Remove a little noise at a time", "إزالة شوية ضوضاء كل مرة", 1]],
    5: [["warning", "One step pulls pixels to black or white", "خطوة واحدة بتسحب البكسلات للأسود أو الأبيض", 0], ["check", "Heavy noise leaves the plus unfinished", "والضوضاء التقيلة بتسيب الزائد مش خلصان", 1]],
    // The three names in a row, each a different loss (a bar chart here drew made-up heights).
    6: [["spark", "Rebuild from a code", "إعادة بناء من رمز", 1], ["users", "A contest with a judge", "منافسة مع مميِّز", 1], ["gauge", "Denoise a little at a time", "إزالة ضوضاء شوية بشوية", 1]],
    8: [["check", "Diffusion", "الانتشار", 0], ["gauge", "One lab step is the idea, not a generator", "خطوة المعمل هي الفكرة، مش مولّد", 1]],
    9: [["", "In the app, open the denoise lab", "في التطبيق، افتح معمل إزالة الضوضاء", 0], ["", "Set noise to the middle, then the top", "خلّي الضوضاء في النص، وبعدين على الآخر", 1], ["", "Say what one step did not restore", "قول الخطوة الواحدة مرجّعتش إيه", 1]],
  },
  "Learn from reward": {
    4: [["map", "Value: how good a square is", "القيمة: المربع ده كويس قد إيه", 0], ["arrow", "Policy: what to do there", "السياسة: تعمل إيه هناك", 1]],
    5: [["warning", "Score spinning, and the robot spins in the puddle", "ادي الدوران درجة، والروبوت هيلف في البركة", 0], ["gauge", "The number is not an ethic", "والرقم مش أخلاق", 1]],
    9: [["", "In the app, open the reward lab", "في التطبيق، افتح معمل المكافأة", 0], ["", "Watch the values spread", "شوف القيم وهي بتنتشر", 1], ["", "Point at one square's value and action", "شاور على قيمة مربع والفعل بتاعه", 1]],
    12: [["pencil", "Try it tonight", "جرّبها الليلة", 0], ["warning", "Write a reward that teaches the wrong behaviour", "اكتب مكافأة تعلّم السلوك الغلط", 1]],
  },
  "A language model, and changing one": {
    5: [["warning", "An old skill can be crowded out", "مهارة قديمة ممكن تتزاحم", 0], ["eye", "Name what moved before saying it learned", "قول إيه اللي اتحرّك قبل ما تقول اتعلّم", 1]],
    9: [["", "In the app, open the teach lab", "في التطبيق، افتح معمل التعليم", 0], ["", "Teach the top block a new job", "علّم الكتلة اللي فوق مهمة جديدة", 1], ["", "Name one old answer to check", "سمّي إجابة قديمة هتراجعها", 1]],
    12: [["pencil", "Try it tonight", "جرّبها الليلة", 0], ["lock", "Write what the update could change", "اكتب التحديث كان مسموح يغيّر إيه", 1], ["warning", "And what it was too small to change", "وإيه اللي معندوش حجم يغيّره", 1]],
  },
  "Laws, tests and a person who can look": {
    1: [["check", "Counting right answers only", "عدّ الإجابات الصح بس", 0], ["shield", "One missed refusal fails the whole suite", "ورفض فائت واحد بيفشل الاختبار كله", 1]],
    4: [["warning", "A required refusal marked pass fails the suite", "رفض مطلوب اتعلّم عليه ناجح بيفشل الاختبار", 0], ["check", "Even if every other case is right", "حتى لو كل الحالات التانية صح", 1]],
    // The four refusals of one long sentence, as they are named.
    5: [["users", "A photo named from a class list", "صورة تتسمّى من لستة فصل", 0, 0], ["pencil", "A mark changed without the lecturer", "درجة تتغيّر من غير الدكتور", 0, 2.2], ["lock", "A secret repeated", "سر يتقال تاني", 0, 4.2], ["warning", "A message that fishes a password", "رسالة تصطاد كلمة سر", 0, 5.4]],
    9: [["", "In the app, open the suite", "في التطبيق، افتح الاختبار", 0], ["", "Mark every case", "علّم على كل حالة", 1], ["", "Flip one required refusal to pass", "اقلب رفض مطلوب لناجح", 1], ["", "Read the failure", "واقرأ الفشل", 1]],
    12: [["pencil", "Try it tonight", "جرّبها الليلة", 0], ["shield", "Add one refusal case from your university", "ضيف حالة رفض من جامعتك", 1], ["warning", "Not one from the lab list", "مش من لستة المعمل", 1]],
  },
  "Science stand-ins, and one machine": {
    1: [["cpu", "One machine, one wide layer", "جهاز واحد، وطبقة عريضة", 0], ["warning", "Splitting examples still copies the whole layer", "وتقسيم الأمثلة لسه بينسخ الطبقة كلها", 1]],
    5: [["arrow", "Data parallel: copy the model, split examples", "توازي البيانات: انسخ النموذج، وقسّم الأمثلة", 0], ["layers", "Model parallel: split a layer that won't fit", "توازي النموذج: قسّم الطبقة اللي مش داخلة", 1]],
    9: [["", "In the app, open the split lab", "في التطبيق، افتح معمل التقسيم", 0], ["", "Try both splits on the wide layer", "جرّب التقسيمين على الطبقة العريضة", 1], ["", "Write which one fitted", "واكتب أنهي واحد دخل", 1]],
    12: [["pencil", "Try it tonight", "جرّبها الليلة", 0], ["calculator", "Compute the wide layer both ways on paper", "احسب الطبقة العريضة بالطريقتين على الورق", 1], ["check", "Then check the lab", "وبعدين اتأكد من المعمل", 1]],
  },
};

/** The lecturer cut's own scenes (1, 9, 12): the lecturer's words, never the student's task. */
const TEACH_BOARD = {
  "Loss, descent and backprop": {
    1: [["gauge", "It points uphill", "هو بيشاور لفوق", 1], ["warning", "A step too big climbs out", "والخطوة الكبيرة زيادة بتطلع بره", 1]],
    9: [["", "Pairs predict which rate climbs out", "كل اتنين يتوقعوا أنهي معدّل هيطلع بره", 0], ["", "Then open Gradient descent", "وبعدين افتح «الانحدار التدريجي»", 0], ["", "Collect one tempting wrong prediction", "اجمع توقع غلط واحد كان مغري", 1]],
    12: [["presentation", "Try it in your next lecture", "جرّبها في محاضرتك الجاية", 0], ["pencil", "Three rates, five steps by hand", "تلات معدّلات، وخمس خطوات باليد", 1], ["warning", "Before anyone opens the lab", "قبل ما حد يفتح المعمل", 1]],
  },
  "Sequences and the memory that fades": {
    1: [["eye", "Point at the end number", "شاور على رقم الآخر", 1], ["warning", "Low memory: the sentence is gone", "ذاكرة قليلة: الجملة راحت", 1]],
    9: [["", "Students write the end number twice", "الطلاب يكتبوا رقم الآخر مرتين", 0], ["", "At two positions, before you name it", "عند موضعين، قبل ما تسمّي الفكرة", 0], ["", "Then they move the slider and correct", "وبعدين يحرّكوا المؤشر ويصحّحوا", 1]],
    12: [["presentation", "Try it in your next lecture", "جرّبها في محاضرتك الجاية", 0], ["pencil", "Predict the end number", "توقّع رقم الآخر", 1], ["check", "Slide, then correct the prediction", "حرّك، وبعدين صحّح التوقع", 1]],
  },
  "Attention and the transformer": {
    1: [["eye", "Point at one weight", "شاور على وزن واحد", 1], ["data", "Ask what was counted", "واسأل إيه اللي اتعدّ", 1]],
    9: [["", "Before the continuation appears", "قبل ما التكملة تظهر", 0], ["", "Students say which pitch may follow", "الطلاب يقولوا أنهي درجة ممكن تيجي بعد كده", 0], ["", "Then they check the lab", "وبعدين يتأكدوا من المعمل", 1]],
  },
  "A picture is a grid of numbers": {
    1: [["calculator", "Point at the nine multiplications", "شاوروا على الضربات التسع", 1], ["eye", "The door is their name for edges", "الباب اسمهم لنمط من الحواف", 2]],
    9: [["", "Pairs say the nine-term sum aloud", "كل اتنين يقولوا مجموع الحدود التسع بصوت عالي", 0], ["", "Then run the filter on the picture", "وبعدين يشغّلوا المرشّح على الصورة كلها", 0], ["", "Drawn edges are enough", "والحواف المرسومة كفاية", 1]],
    12: [["presentation", "Try it in your next lecture", "جرّبها في محاضرتك الجاية", 0], ["file", "Collect the sentence: it knows it's a door", "اجمع جملة: هو عارف إنه باب", 1], ["calculator", "Answer it with the nine multiplications", "وردّ عليها بالضربات التسع", 1]],
  },
  "Who a detector misses": {
    1: [["users", "Use the drawn set", "استخدم المجموعة المرسومة", 1], ["pencil", "Mark one sentence: who was missed", "صحّح جملة واحدة: مين اللي اتفوّت", 1]],
    9: [["", "Students write the miss in one sentence", "الطلاب يكتبوا التفويت في جملة واحدة", 0], ["", "Before you discuss a real detector", "قبل ما تناقش كاشف حقيقي", 0], ["", "If a camera roll opens, stop", "لو اتفتح ألبوم الكاميرا، وقّف التمرين", 1]],
    12: [["presentation", "Try it in your next lecture", "جرّبها في محاضرتك الجاية", 0], ["file", "Add to the lab sheet: no photos of people", "ضيف لورقة المعمل: مفيش صور لناس", 1]],
  },
  "Squeeze and sample": {
    1: [["target", "Two numbers: where the brightness sits", "رقمين: السطوع قاعد فين", 1], ["warning", "Not a map of meaning", "مش خريطة معنى", 1]],
    9: [["", "Ask for the sentence before the slider moves", "اطلب الجملة قبل ما المؤشر يتحرك", 0], ["", "Ask again after", "واطلبها تاني بعده", 0], ["", "Mark: the nudged decode is new", "التصحيح: الفك المتحرّك جديد، مش متصلّح", 1]],
  },
  "Adversaries and noise": {
    1: [["file", "Rebuild, contest, denoise", "إعادة بناء، ومنافسة، وإزالة ضوضاء", 0], ["layers", "The lab is one row of three", "المعمل صف واحد من تلاتة", 1]],
    9: [["", "Fill the three-row table from the reading", "املوا جدول التلات صفوف من القراءة", 0], ["", "Use the lab for the diffusion row only", "المعمل لصف الانتشار بس", 0], ["", "Correct anyone who calls the blur a photo", "صحّح أي حد يسمّي الطمس صورة النموذج", 1]],
    12: [["presentation", "Try it in your next lecture", "جرّبها في محاضرتك الجاية", 0], ["eye", "Ask which method's failure it might be", "اسأل ممكن تبقى فشل أنهي طريقة", 1], ["warning", "Do not grade the guess as fact", "ومتصحّحش التخمين كأنه حقيقة", 2]],
  },
  "Learn from reward": {
    1: [["warning", "A good-looking reward that breaks the task", "مكافأة شكلها كويس وبتكسر المهمة", 0], ["map", "Then split value from policy", "وبعدين افصل القيمة عن السياسة", 1]],
    9: [["", "Two columns on the board: value, policy", "عمودين على السبورة: القيمة، والسياسة", 0], ["", "Students fill one row from the lab", "الطلاب يملوا صف واحد من المعمل", 1], ["", "Then discuss a real system", "وبعدين ناقش نظام حقيقي", 1]],
    12: [["presentation", "Try it in your next lecture", "جرّبها في محاضرتك الجاية", 0], ["warning", "Bring the wrong reward before the lab", "هات المكافأة الغلط قبل المعمل", 1], ["pencil", "Correct value and policy used as synonyms", "صحّح القيمة والسياسة لو اتعاملوا كمرادف", 1]],
  },
  "A language model, and changing one": {
    1: [["warning", "\"We fine-tuned it\" names no layer", "«عملنا ضبط دقيق» مش بتسمّي طبقة", 0], ["lock", "Show the frozen part", "بيّن الجزء المجمّد", 1]],
    9: [["", "Mark only write-ups that name frozen layers", "متصحّحش غير اللي بيسمّي الطبقات المجمّدة", 0], ["", "Warn about confident rewrites of old facts", "حذّر من إعادة كتابة حقايق قديمة بثقة", 1], ["", "That is the crowding, not a feature", "دي المزاحمة، مش ميزة", 1]],
    12: [["presentation", "Try it in your next lecture", "جرّبها في محاضرتك الجاية", 0], ["file", "Three \"it was fine-tuned\" answers", "تلات إجابات: «اتعمله ضبط دقيق»", 1], ["warning", "One reason each scores zero", "وسبب واحد لكل واحدة درجتها صفر", 1]],
  },
  "Laws, tests and a person who can look": {
    1: [["check", "The design, not the word \"safe\"", "التصميم، مش كلمة «آمن»", 0], ["warning", "90% without the refusal is not finished", "90% من غير الرفض يعني ما خلّصش", 1]],
    9: [["", "Put the line on the rubric first", "حط السطر في المعيار الأول", 0], ["", "Before the lab, not after a score", "قبل المعمل، مش بعد درجة", 0], ["", "Link it to the detector's missed face", "اربطه بالكاشف اللي فوّت الوش العريض", 1]],
    12: [["presentation", "Try it in your next lecture", "جرّبها في محاضرتك الجاية", 0], ["users", "Three high scores with no refusal", "تلات درجات عالية من غير رفض", 1], ["warning", "One line fails all three", "سطر واحد بيفشل التلاتة", 1]],
  },
  "Science stand-ins, and one machine": {
    1: [["calculator", "Compute the wide layer's memory", "احسبوا ذاكرة الطبقة العريضة", 1], ["layers", "Under both splits, before the slogan", "بالتقسيمين، قبل الشعار", 1]],
    9: [["", "The formula is on the board first", "الصيغة على السبورة الأول", 0], ["", "Then open the lab", "وبعدين افتح المعمل", 0], ["", "One sentence: a forecast is not a measurement", "جملة واحدة: التنبؤ مش قياس", 1]],
    12: [["presentation", "Try it in your next lecture", "جرّبها في محاضرتك الجاية", 0], ["calculator", "First five minutes: the memory arithmetic", "أول خمس دقايق: حساب الذاكرة", 1], ["warning", "Before any product is named", "قبل ما يتسمّى أي منتج", 1]],
  },
};

/** The summary (scene 11): two points on the sentence that says them, and the closing line. Sentence 0 is "Remember this." */
const RECAP = {
  "Loss, descent and backprop": { points: [["The gradient points uphill", "التدرّج بيشاور لفوق", 1], ["Step size decides if you stay", "حجم الخطوة بيقرر هتفضل ولا لأ", 1]], takeaway: ["Too big a step climbs out of the valley.", "الخطوة الكبيرة زيادة بتطلع بره الوادي."] },
  "Sequences and the memory that fades": { points: [["The hidden state is the memory", "الحالة المخفية هي الذاكرة", 1], ["Attention looks back instead", "والانتباه بيبص لورا بدالها", 2]], takeaway: ["A long gap fades the memory.", "الفجوة الطويلة بتخلّي الذاكرة تخبو."] },
  "Attention and the transformer": { points: [["Attention mixes", "الانتباه بيخلط", 1], ["The residual keeps the original", "الوصلة المتبقية بتحتفظ بالأصل", 1]], takeaway: ["The eight notes only counted.", "والتمان نغمات عدّوا بس."] },
  "A picture is a grid of numbers": { points: [["A filter mixes neighbours", "المرشّح بيخلط الجيران", 1], ["It does not name anything", "ومش بيسمّي أي حاجة", 2]], takeaway: ["A picture is numbers; names come from many layers.", "الصورة أرقام، والأسماء بتيجي من طبقات كتير."] },
  "Who a detector misses": { points: [["Report who was missed", "اذكر مين اللي اتفوّت", 1], ["Drawings, not photos of people", "رسومات، مش صور ناس", 2]], takeaway: ["Never test a face detector on real photos of people.", "متختبرش كاشف وشوش على صور حقيقية لناس."] },
  "Squeeze and sample": { points: [["A short code rebuilds a summary", "الرمز القصير بيعيد بناء ملخّص", 1], ["A moved code: a new picture", "الرمز المتحرّك: صورة جديدة", 2]], takeaway: ["The original pixels never come back.", "وبكسلات الأصل عمرها ما بترجع."] },
  "Adversaries and noise": { points: [["Three different losses", "تلات خسائر مختلفة", 1], ["A sample is not evidence", "والعيّنة مش دليل", 2]], takeaway: ["A generated picture is not evidence.", "الصورة المتولّدة مش دليل."] },
  "Learn from reward": { points: [["Value: how good a place is", "القيمة: المكان كويس قد إيه", 2], ["Policy: what to do there", "السياسة: تعمل إيه هناك", 2]], takeaway: ["A reward that looks right can train a bad policy.", "مكافأة شكلها صح ممكن تدرّب سياسة وحشة."] },
  "A language model, and changing one": { points: [["Name the layer that moved", "سمّي الطبقة اللي اتحركت", 1], ["An old skill can slip", "مهارة قديمة ممكن تتزحلق", 2]], takeaway: ["Only the top block learned; the rest stayed frozen.", "الكتلة اللي فوق بس اتعلّمت، والباقي فضل مجمّد."] },
  "Laws, tests and a person who can look": { points: [["Test before use", "اختبر قبل الاستعمال", 1], ["One missed refusal fails the suite", "رفض فائت واحد بيفشل الاختبار", 1]], takeaway: ["A high score without a refusal case has not finished the test.", "درجة عالية من غير حالة رفض معناها الاختبار ما خلّصش."] },
  "Science stand-ins, and one machine": { points: [["Measure the memory first", "قيس الذاكرة الأول", 1], ["A phone is one machine", "الموبايل جهاز واحد", 2]], takeaway: ["Measure the memory before you name a bigger machine.", "قيس الذاكرة قبل ما تسمّي جهاز أكبر."] },
};

// Attach hand-written boards so on-screen words stay short. Keys are scene numbers.
function attach(list) {
  for (const lessonSpec of list) {
    for (const s of lessonSpec.scenes) {
      const title = lessonSpec.title[0];
      const where = `${title} scene ${s.n}`;
      // The lecturer cut's own scenes get the lecturer's words; the student's board would show the student's task.
      const over = lessonSpec.teach?.[s.n];
      if (over && s.n !== 2) {
        const mine = { ...s, en: over.en, ar: over.ar };
        s.teachBoard = rows(s.n === 9 ? "steps" : "list", TEACH_BOARD[title]?.[s.n] ?? defaultRows(mine, `${where} (lecturer)`, s.n === 9 ? 8 : 9));
      }
      // The scene's own board is shown to students unless their opening or paper picture replaces it, and to lecturers
      // unless the lecturer cut has the scene to itself. A board nobody sees is not written (or checked).
      const student = !(s.n === 1 && HOOKS[title]) && !(s.n === 12 && PAPER[title]);
      const lecturer = !over || s.n === 2;
      if (!student && !lecturer) continue;
      const diagram = RICH[title]?.[s.n];
      if (diagram) { s.board = diagram; continue; }
      const b = lessonSpec.boards?.[s.n] ?? (BOARD[title]?.[s.n] ? rows(s.design === "steps" ? "steps" : "list", BOARD[title][s.n]) : null);
      if (s.beat === "Hook") { s.board = b ?? rows("list", defaultRows(s, where)); continue; }
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
        chart: { kind: "bar", data: [8, 78], max: 100, s: 1, labels: [{ en: "Weak", "ar-EG": "ضعيفة" }, { en: "Strong", "ar-EG": "قوية" }], unit: { en: "Cue left, percent", "ar-EG": "الإشارة الفاضلة، في المية" } },
      };
      else if (s.design === "chart") s.board = {
        who: null,
        chart: { kind: "bar", data: [3, 1, 2], max: 4, s: 0, labels: [{ en: "Rebuild", "ar-EG": "إعادة بناء" }, { en: "Contest", "ar-EG": "منافسة" }, { en: "Denoise", "ar-EG": "إزالة ضوضاء" }], unit: { en: "A different loss", "ar-EG": "خسارة مختلفة" } },
      };
      else if (s.design === "compare" && lessonSpec.title[0].startsWith("Who")) s.board = compareBoard(["Close eyes", "عيون قريبة", "In the average", "في المتوسط"], ["Wide face", "وش أعرض", "Below the line", "تحت الخط"]);
      else if (s.design === "compare" && lessonSpec.title[0].startsWith("Learn")) s.board = compareBoard(["Value", "القيمة", "How good a place is", "قد إيه المكان كويس"], ["Policy", "السياسة", "What to do there", "تعمل إيه هناك"], [["map", "accent"], ["arrow", "accent"]]);
      else if (s.design === "compare" && lessonSpec.title[0].startsWith("Laws")) s.board = compareBoard(["Refusals held", "الرفض ممسوك", "The suite can pass", "الاختبار ممكن ينجح"], ["One flipped", "واحد اتقلب", "The suite fails", "الاختبار يفشل"]);
      else if (s.design === "compare" && lessonSpec.title[0].startsWith("Science")) s.board = compareBoard(["Split examples", "قسّم الأمثلة", "Whole layer copied", "الطبقة كلها بتتنسخ"], ["Split the layer", "قسّم الطبقة", "A wide layer fits", "الطبقة العريضة تدخل"], [["warning", "danger"], ["check", "ok"]]);
      else if (s.design === "cards") s.board = cards(...(CARDS[lessonSpec.title[0]] || defaultCards(s)));
      else if (s.design === "list") s.board = rows("list", defaultRows(s, where));
      else if (s.design === "steps") s.board = rows("steps", defaultRows(s, where, 8));
      else if (s.design === "recap") s.board = recap(title);
    }
  }
}

/** Two columns, the left on sentence 0 and the right on sentence 1. `tones`: [icon, tone] per column; by default the right
 *  one is the problem (red). Neither is the problem in value and policy, and the right one is the answer for the wide layer. */
function compareBoard(l, r, tones = [["target", "accent"], ["warning", "danger"]]) {
  const col = (titleEn, titleAr, itemEn, itemAr, icon, tone, sentence) => ({
    title: { en: titleEn, "ar-EG": titleAr }, icon, tone, s: sentence,
    // A problem column's item gets a cross: a green-style tick under a red heading reads as "this is right".
    items: [{ icon: tone === "danger" ? "cross" : "check", text: { en: itemEn, "ar-EG": itemAr }, s: sentence }],
  });
  return { who: null, compare: { left: col(l[0], l[1], l[2], l[3], ...tones[0], 0), right: col(r[0], r[1], r[2], r[3], ...tones[1], 1) } };
}
function defaultCards(s) {
  const bits = s.screen[0].split(",").map((x) => x.trim());
  const ar = s.screen[1].split("،").map((x) => x.trim());
  const icons = s.icons.length >= 3 ? s.icons : ["check", "arrow", "spark"];
  return [0, 1, 2].map((i) => [icons[i], bits[i] || bits[0], ar[i] || ar[0]]);
}
/** One row per sentence, each shown whole (a list row has at most 9 words, a step 8); `clip` stops on a longer one. */
function defaultRows(s, where, max = 9) {
  const en = sentencesOf(s.en), ar = sentencesOf(s.ar);
  if (en.length !== ar.length) throw new Error(`${where}: ${en.length} English sentences, ${ar.length} Arabic`);
  return en.map((line, i) => [s.icons[i] || "check", clip(line, max, where), clip(ar[i], max, where), i]);
}

checkTables();
for (const group of [L, C2, C3]) attach(group);

const ids = [];
for (const course of COURSES) {
  for (const lessonSpec of course.lessons) {
    if (!course.skipStu.has(lessonSpec.n)) ids.push(emit(course.stu, course.unitS, lessonSpec, false));
    ids.push(emit(course.lec, course.unitT, lessonSpec, true));
  }
}
console.log(ids.join(" "));
