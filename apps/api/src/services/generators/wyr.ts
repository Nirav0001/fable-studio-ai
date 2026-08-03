// ── Would-You-Rather question generator ──────────────────────────────────────
// Deterministic-first: a handcrafted bank of 195 pairs (15 per theme × 13
// themes), expanded combinatorially with 12 modifier templates into 2,500+
// unique possibilities. Every pair is hash-deduped (wyrHash) against the whole
// WyrQuestion table before being persisted, so a channel never repeats a
// question. When an AI key is present we ask the model for fresh pairs first
// and fall back to the bank on any error.

import type { WyrDifficulty, WyrQuestionT } from "@fable/shared";
import { WYR_THEMES, clamp, fnv1a, seededRandom, wyrHash } from "@fable/shared";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { aiCompleteJson, isMockAi } from "../ai";

export { buildWyrScript } from "./script";

const log = createLogger("gen:wyr");

// ── The bank ─────────────────────────────────────────────────────────────────

interface BankPair {
  a: string;
  b: string;
  /** % of viewers who pick option A — lopsided or dead-50/50 for drama. */
  percentA: number;
  factoid: string;
  difficulty: WyrDifficulty;
}

const BANK: Record<string, BankPair[]> = {
  food: [
    { a: "never eat pizza again", b: "never eat chocolate again", percentA: 58, factoid: "Pizza wins most food polls — but chocolate fans never switch sides.", difficulty: "easy" },
    { a: "eat only sweet food forever", b: "eat only savoury food forever", percentA: 31, factoid: "Savoury wins — most people crack within three days of sweet-only.", difficulty: "easy" },
    { a: "give up cheese forever", b: "give up coffee forever", percentA: 44, factoid: "Coffee drinkers say cheese. Cheese lovers just leave the room.", difficulty: "medium" },
    { a: "drink a ketchup smoothie", b: "eat a mayonnaise sundae", percentA: 62, factoid: "Ketchup is about 25% sugar — basically a savoury milkshake already.", difficulty: "hard" },
    { a: "eat your favourite meal every day forever", b: "never eat it again", percentA: 74, factoid: "Food scientists say you'd hate your favourite meal in about 21 days.", difficulty: "easy" },
    { a: "only eat food that's way too spicy", b: "only eat food with no taste at all", percentA: 57, factoid: "Capsaicin triggers a real endorphin rush — spice is legal chaos.", difficulty: "medium" },
    { a: "eat a live cricket", b: "eat a raw onion like an apple", percentA: 48, factoid: "Two billion people eat insects. The raw onion has zero fans.", difficulty: "hard" },
    { a: "get free takeaway for life but it's always cold", b: "pay double but it's always perfect", percentA: 39, factoid: "Cold pizza has defenders. Cold curry does not.", difficulty: "medium" },
    { a: "never taste sweet again", b: "never taste salt again", percentA: 46, factoid: "Your tongue has more salt receptors than sweet ones.", difficulty: "hard" },
    { a: "eat the same school lunch every day", b: "eat a mystery meal you can't choose", percentA: 42, factoid: "Mystery meal wins — humans pick novelty over safety almost every time.", difficulty: "medium" },
    { a: "brush your teeth with hot sauce", b: "shower in BBQ sauce", percentA: 55, factoid: "The hot sauce is 30 seconds of pain. The shower is a lifestyle.", difficulty: "impossible" },
    { a: "only eat breakfast foods", b: "only eat dinner foods", percentA: 61, factoid: "Breakfast-for-dinner is the most requested cheat meal on Earth.", difficulty: "easy" },
    { a: "give up snacks forever", b: "give up desserts forever", percentA: 52, factoid: "A true 50/50 — this question has ended friendships.", difficulty: "medium" },
    { a: "eat pineapple pizza every single time", b: "never eat pizza again", percentA: 68, factoid: "Pineapple pizza was invented in Canada, not Hawaii.", difficulty: "easy" },
    { a: "find a hair in every meal", b: "bite your tongue during every meal", percentA: 47, factoid: "The tongue bite polls worse — pain beats disgust by a whisker.", difficulty: "impossible" },
  ],
  animals: [
    { a: "fight one horse-sized duck", b: "fight 100 duck-sized horses", percentA: 43, factoid: "The internet's oldest question — even presidents have answered it.", difficulty: "medium" },
    { a: "talk to animals", b: "speak every human language", percentA: 55, factoid: "Most pick animals... then remember what dogs would actually say.", difficulty: "easy" },
    { a: "have a pet dragon", b: "be a dragon", percentA: 38, factoid: "Being the dragon wins — nobody trusts themselves with dragon insurance.", difficulty: "easy" },
    { a: "sneeze like a T-rex roar", b: "laugh like a dolphin forever", percentA: 52, factoid: "The dolphin laugh is funny once. The 40th time it's a curse.", difficulty: "medium" },
    { a: "ride a giraffe to school", b: "ride a rhino to school", percentA: 71, factoid: "A giraffe's neck has the same number of bones as yours — seven.", difficulty: "easy" },
    { a: "own a dog that speaks", b: "own a cat that judges you silently", percentA: 82, factoid: "The cat already judges you silently. That's just a cat.", difficulty: "easy" },
    { a: "be chased by one angry goose", b: "be chased by five silent swans", percentA: 41, factoid: "Swans can break bones. The goose just wants chaos.", difficulty: "hard" },
    { a: "have shark teeth", b: "have eagle eyes", percentA: 27, factoid: "Sharks regrow teeth their whole lives — dentists hate them.", difficulty: "medium" },
    { a: "sleep 20 hours a day like a cat", b: "never fully sleep like a dolphin", percentA: 63, factoid: "Dolphins sleep with half their brain awake, one eye open.", difficulty: "medium" },
    { a: "have every dog bark at you", b: "have every cat follow you home", percentA: 44, factoid: "Forty cats following you home is a folklore situation.", difficulty: "medium" },
    { a: "be a tiny elephant", b: "be a giant hamster", percentA: 58, factoid: "Giant hamster loses the moment people picture the teeth.", difficulty: "hard" },
    { a: "swim with dolphins", b: "waddle with penguins", percentA: 66, factoid: "Penguins propose with pebbles. It's not relevant, it's just lovely.", difficulty: "easy" },
    { a: "own a spider that spins £1,000 silk", b: "own a chicken that lays a golden egg monthly", percentA: 49, factoid: "Spider silk is stronger than steel by weight — the spider is the better business.", difficulty: "hard" },
    { a: "get stung by ten bees", b: "get stung by one wasp that holds a grudge", percentA: 57, factoid: "Wasps really do mark targets with pheromones. The grudge is real.", difficulty: "impossible" },
    { a: "understand birdsong (it's mostly insults)", b: "understand tail wags (it's mostly love)", percentA: 35, factoid: "Studies suggest bird calls are mostly territory disputes. So yes — insults.", difficulty: "medium" },
  ],
  money: [
    { a: "take £1,000,000 right now", b: "get £10,000 every month for life", percentA: 32, factoid: "The monthly option overtakes the million in year nine — most can't wait.", difficulty: "medium" },
    { a: "be rich and unknown", b: "be famous and broke", percentA: 78, factoid: "Fame polls terribly once people read what trends about famous people.", difficulty: "easy" },
    { a: "find £20 on the floor every week", b: "get applause every time you enter a room", percentA: 84, factoid: "£20 a week is £1,040 a year. The claps pay nothing.", difficulty: "easy" },
    { a: "take 1p doubled every day for 30 days", b: "take £1,000,000 flat", percentA: 41, factoid: "1p doubled for 30 days is £5.3 million. Maths quietly wins.", difficulty: "hard" },
    { a: "never pay rent again", b: "never pay for food again", percentA: 63, factoid: "Average UK rent beats average food spend nearly 3-to-1.", difficulty: "medium" },
    { a: "get £100,000 you can only spend on others", b: "get £10,000 just for you", percentA: 44, factoid: "The generous option wins in polls — and loses in private.", difficulty: "hard" },
    { a: "have a card that pays for anything under £10", b: "get £500 cash every month", percentA: 52, factoid: "Most daily purchases are under £10 — the card is sneaky-good.", difficulty: "medium" },
    { a: "win the lottery but tell no one", b: "earn it slowly with full bragging rights", percentA: 57, factoid: "Lottery winners who stay quiet keep more friends AND more money.", difficulty: "hard" },
    { a: "earn £1 for every step you walk", b: "earn £50 for every book you finish", percentA: 61, factoid: "The average person walks 4,000 steps a day. That's £1.4M a year.", difficulty: "medium" },
    { a: "get free flights forever", b: "get free hotels forever", percentA: 55, factoid: "Flights are the bigger cost — but you can sleep in an airport exactly once.", difficulty: "easy" },
    { a: "retire at 30 with just enough", b: "work forever at a job you love", percentA: 66, factoid: "'Just enough' beats 'dream job' in every survey since 2015.", difficulty: "medium" },
    { a: "take £1,000,000 but your search history goes public", b: "stay broke and private", percentA: 38, factoid: "62% keep the history buried. What are you all hiding?", difficulty: "impossible" },
    { a: "cry £50 notes", b: "laugh 50p coins", percentA: 46, factoid: "Laughing is easier to trigger — but the exchange rate is brutal.", difficulty: "medium" },
    { a: "own 1% of a giant tech company", b: "own 100% of a small business", percentA: 59, factoid: "1% of a trillion-pound company is £10 billion. Do the maths first.", difficulty: "hard" },
    { a: "never check a price tag again", b: "never wait in a queue again", percentA: 64, factoid: "Brits spend six months of their life queueing. It's still not enough to win.", difficulty: "medium" },
  ],
  superpowers: [
    { a: "fly", b: "be invisible", percentA: 62, factoid: "Flight wins every poll since 2010 — invisibility answers scare people.", difficulty: "easy" },
    { a: "read minds", b: "see ten minutes into the future", percentA: 41, factoid: "Ten minutes is enough to dodge every awkward conversation forever.", difficulty: "medium" },
    { a: "have super strength", b: "have super speed", percentA: 35, factoid: "Speed wins — physics says fast enough IS strong.", difficulty: "easy" },
    { a: "teleport anywhere once a day", b: "fly slowly whenever you want", percentA: 57, factoid: "One teleport beats slow flight the moment it rains.", difficulty: "medium" },
    { a: "pause time whenever you want", b: "rewind ten seconds unlimited times", percentA: 48, factoid: "Rewind means no mistake ever sticks. Pause means naps forever.", difficulty: "hard" },
    { a: "talk to machines", b: "control the weather", percentA: 39, factoid: "Weather control is geopolitics. Talking to printers is priceless.", difficulty: "medium" },
    { a: "heal any wound instantly", b: "never feel pain at all", percentA: 72, factoid: "Never feeling pain is a real condition — and it's genuinely dangerous.", difficulty: "medium" },
    { a: "turn invisible only when no one is looking", b: "fly but only 30cm off the ground", percentA: 44, factoid: "Hover-walking is technically flying. Legally, too.", difficulty: "impossible" },
    { a: "have a perfect memory", b: "have unstoppable charm", percentA: 53, factoid: "Charm gets you in the room. Memory remembers why you left.", difficulty: "medium" },
    { a: "breathe underwater", b: "survive any fall", percentA: 46, factoid: "71% of the planet is ocean — the water power unlocks more map.", difficulty: "hard" },
    { a: "be invisible with your eyes closed (you can't see either)", b: "fly but scream uncontrollably the whole time", percentA: 51, factoid: "The screaming flight is at least honest about how flying feels.", difficulty: "impossible" },
    { a: "stop every villain but get zero credit", b: "get all the credit but stop no one", percentA: 81, factoid: "81% pick the anonymous hero. The other 19% run social media.", difficulty: "hard" },
    { a: "shape-shift into any animal", b: "shape-shift into any person", percentA: 58, factoid: "Animal wins — being other people is a legal minefield.", difficulty: "medium" },
    { a: "have unlimited strength in one pinky", b: "have laser eyes that only toast bread", percentA: 47, factoid: "The pinky can deadlift a bus. The eyes make breakfast. Choose wisely.", difficulty: "easy" },
    { a: "know every answer but never be able to say it", b: "speak every language but never lie", percentA: 43, factoid: "Never lying eliminates 'I'm five minutes away' from your life.", difficulty: "impossible" },
  ],
  movies: [
    { a: "live in the Star Wars universe", b: "live in the Harry Potter universe", percentA: 45, factoid: "Hogwarts has a 100% magical healthcare system. The galaxy does not.", difficulty: "easy" },
    { a: "only watch horror films forever", b: "only watch romcoms forever", percentA: 51, factoid: "Horror fans handle stress better in studies. Romcom fans sleep better.", difficulty: "medium" },
    { a: "know every ending in advance", b: "never see how any film ends", percentA: 36, factoid: "Spoiler studies say knowing the ending makes films MORE enjoyable.", difficulty: "hard" },
    { a: "be the hero who dies in the finale", b: "be the villain who survives", percentA: 42, factoid: "The villain gets the sequel. The hero gets a statue.", difficulty: "medium" },
    { a: "have a cinema in your house", b: "get premiere tickets to everything forever", percentA: 67, factoid: "The home cinema wins the moment someone talks during a premiere.", difficulty: "easy" },
    { a: "live one day as your favourite character", b: "have them live one day as you", percentA: 71, factoid: "Nobody wants their favourite character seeing their screen time.", difficulty: "medium" },
    { a: "have every film be a musical", b: "have every film play in slow motion", percentA: 63, factoid: "A 3-hour epic in slow motion is a 9-hour epic. The musical wins.", difficulty: "easy" },
    { a: "watch your life as a serious documentary", b: "watch it as a mockumentary with a sarcastic narrator", percentA: 38, factoid: "62% choose the sarcastic narrator. We know what we are.", difficulty: "medium" },
    { a: "delete superhero films forever", b: "only ever get superhero films", percentA: 47, factoid: "Superhero films were 30% of box office revenue at their peak.", difficulty: "hard" },
    { a: "appear in the film with no lines", b: "narrate it but never appear", percentA: 44, factoid: "Narrators get paid more per word than extras get paid per day.", difficulty: "medium" },
    { a: "get free popcorn forever but it's always stale", b: "pay £10 but it's always perfect", percentA: 29, factoid: "Cinema popcorn costs about 60p to make. You're welcome.", difficulty: "easy" },
    { a: "live in a zombie film where you're fast", b: "live in an alien invasion where they're polite", percentA: 41, factoid: "The polite aliens still invaded. Read the fine print.", difficulty: "hard" },
    { a: "cry at every trailer", b: "laugh out loud at every sad scene in public", percentA: 57, factoid: "Trailer crying is private-ish. The funeral-scene laugh is a reputation.", difficulty: "impossible" },
    { a: "star in a flop everyone forgets", b: "star in a hit where you're the meme", percentA: 46, factoid: "Memes are forever. Flops get streaming re-runs. There's no winning.", difficulty: "medium" },
    { a: "watch every sequel before the original", b: "watch every film with ad breaks every 10 minutes", percentA: 61, factoid: "Sequels-first is chaotic. Ad breaks are violence.", difficulty: "medium" },
  ],
  gaming: [
    { a: "have unlimited money in every game", b: "have unlimited skill in one game", percentA: 44, factoid: "One-game gods make millions streaming. Rich accounts get banned.", difficulty: "medium" },
    { a: "lag for one second every ten seconds", b: "play at 20fps forever", percentA: 41, factoid: "Pros picked the 20fps — consistent timing beats random stutter.", difficulty: "hard" },
    { a: "never rage quit again", b: "never get camped again", percentA: 52, factoid: "A perfect 50/50 — both options delete someone's whole personality.", difficulty: "medium" },
    { a: "get one life per game per day", b: "get infinite lives at half speed", percentA: 47, factoid: "One-life gaming is just a hardcore mode with extra steps.", difficulty: "hard" },
    { a: "only play games from 2005", b: "only play games from 2035 sight-unseen", percentA: 38, factoid: "2005 gave us some all-timers. 2035 gives us hope and no reviews.", difficulty: "medium" },
    { a: "have voice chat permanently on", b: "be permanently muted", percentA: 33, factoid: "67% choose mute. Everyone who's heard voice chat understands.", difficulty: "easy" },
    { a: "fight easy bosses for trash loot", b: "fight brutal bosses for god-tier loot", percentA: 22, factoid: "78% grind for the loot. Respect the dedication.", difficulty: "easy" },
    { a: "be world #1 at a dead game", b: "be average at the biggest game on Earth", percentA: 49, factoid: "Being #1 at anything is a personality. Average is invisible.", difficulty: "hard" },
    { a: "speedrun all your chores", b: "have turn-based arguments", percentA: 58, factoid: "Turn-based arguments would fix most group chats, honestly.", difficulty: "easy" },
    { a: "lose every ranked game but gain fans", b: "win everything with zero viewers", percentA: 43, factoid: "Streamers monetise losing all the time. It's called content.", difficulty: "medium" },
    { a: "have controller drift forever", b: "have a keyboard with a sticky W key", percentA: 46, factoid: "The sticky W means you walk forward forever. Into walls. Into lava.", difficulty: "impossible" },
    { a: "get every skin free forever", b: "get every game free forever", percentA: 37, factoid: "Free games is the objectively correct answer. Drip chose violence anyway.", difficulty: "easy" },
    { a: "play once with your idol", b: "play forever with your best friend", percentA: 31, factoid: "The duo queue with your best mate is the actual endgame.", difficulty: "medium" },
    { a: "hear NPC dialogue in your head", b: "see your thoughts as a kill feed", percentA: 54, factoid: "The kill feed of your own thoughts at 3am is a horror game.", difficulty: "medium" },
    { a: "delete your main account", b: "restart every game at level 1 but keep your knowledge", percentA: 24, factoid: "Knowledge is the real save file — 76% restart without blinking.", difficulty: "hard" },
  ],
  sports: [
    { a: "score the winner in a World Cup final", b: "win Olympic gold in a solo event", percentA: 66, factoid: "A billion people watch the World Cup final. No pressure.", difficulty: "easy" },
    { a: "be the GOAT nobody remembers", b: "be an average player everyone loves", percentA: 41, factoid: "Fans keep statues of average players with great stories.", difficulty: "medium" },
    { a: "have unlimited stamina", b: "have perfect aim", percentA: 52, factoid: "Dead 50/50 — every sport splits this room differently.", difficulty: "medium" },
    { a: "play every sport decently", b: "play one sport perfectly", percentA: 61, factoid: "The decathlon exists because 'decently at everything' is elite.", difficulty: "easy" },
    { a: "win every race by 0.01 seconds", b: "lose every final by 0.01 but earn double", percentA: 72, factoid: "Athletes say the 0.01 losses haunt forever. Money doesn't cover therapy.", difficulty: "hard" },
    { a: "have trash talk that always lands", b: "have a celebration that goes viral every time", percentA: 47, factoid: "The celebration outlives the match. Ask anyone who's hit a griddy.", difficulty: "easy" },
    { a: "referee your rival's final", b: "commentate your own defeat", percentA: 55, factoid: "Commentating your own loss live is a psychological event.", difficulty: "medium" },
    { a: "never miss a penalty", b: "never get injured", percentA: 34, factoid: "Pros pick health every time — careers end in one bad tackle.", difficulty: "medium" },
    { a: "be 7ft tall in basketball", b: "be 5ft with a 50-inch vertical", percentA: 44, factoid: "A 50-inch vertical would be the highest ever recorded. By a lot.", difficulty: "hard" },
    { a: "get booed at home and loved away", b: "get loved at home and booed away", percentA: 38, factoid: "Home crowds are 60% of the season. Choose your peace.", difficulty: "medium" },
    { a: "get gym results without the gym", b: "get runner's high without running", percentA: 63, factoid: "Runner's high is real — endocannabinoids, not endorphins.", difficulty: "easy" },
    { a: "coach a losing team of legends", b: "coach a champion team of rookies", percentA: 46, factoid: "Legends losing is a documentary. Rookies winning is a movie.", difficulty: "hard" },
    { a: "sweat glitter", b: "cry protein shake", percentA: 51, factoid: "Glitter never fully washes out. Scientists call it 'the herpes of craft supplies'.", difficulty: "impossible" },
    { a: "have a commentator narrate your life", b: "have a stadium wave follow you", percentA: 42, factoid: "The wave following you into a job interview is undefeated content.", difficulty: "easy" },
    { a: "win the title in year one and retire", b: "chase it for 20 years and win at the very end", percentA: 57, factoid: "Psychologists say the 20-year chase makes the win feel 10x bigger.", difficulty: "medium" },
  ],
  school: [
    { a: "have no homework ever", b: "have no exams ever", percentA: 44, factoid: "Homework is 100+ hours a year. Exams are 10 hours of pure terror.", difficulty: "easy" },
    { a: "know every answer but sound unsure", b: "know nothing but sound confident", percentA: 58, factoid: "Studies show confident wrong answers get better marks. Sorry.", difficulty: "medium" },
    { a: "have school start at noon", b: "have school end at 1pm but start at 6am", percentA: 63, factoid: "Teen brains genuinely aren't awake before 10am — it's biology.", difficulty: "medium" },
    { a: "have a teacher read your texts aloud", b: "have your parents attend every class for a week", percentA: 41, factoid: "Both options are technically legal. Neither should be.", difficulty: "impossible" },
    { a: "get a photographic memory in exams only", b: "get charm that works on every teacher", percentA: 66, factoid: "The memory gets the grades. The charm gets the extensions.", difficulty: "medium" },
    { a: "skip one school year entirely", b: "redo one year with your current brain", percentA: 47, factoid: "Redoing year 9 with an adult brain is a superhero origin story.", difficulty: "hard" },
    { a: "eat 5-star cafeteria food in 5 minutes", b: "eat vending machine food with all day to spare", percentA: 52, factoid: "Speed-eating a Michelin lunch is the most school thing imaginable.", difficulty: "medium" },
    { a: "be the funny one with average grades", b: "be the genius nobody laughs with", percentA: 71, factoid: "Class clowns report higher happiness 20 years later. Science said so.", difficulty: "easy" },
    { a: "take every test open-book but double length", b: "take them closed-book but half length", percentA: 49, factoid: "Open-book exams are consistently rated HARDER by students.", difficulty: "hard" },
    { a: "forget everything after each exam", b: "remember everything including the embarrassing bits", percentA: 55, factoid: "Your brain already forgets 70% within 24 hours — one option is just honest.", difficulty: "hard" },
    { a: "hear a squeaky whiteboard pen forever", b: "hear a scraping chair every time you move", percentA: 46, factoid: "Misophonia researchers rate the chair scrape as the worse sound.", difficulty: "medium" },
    { a: "have a best friend in every class but no phone", b: "have your phone but no friends in class", percentA: 68, factoid: "68% picked friends. The other 32% are lying or texting.", difficulty: "easy" },
    { a: "give a speech with the hiccups", b: "sit an exam with music you hate on loop", percentA: 43, factoid: "One song on loop for 2 hours is a recognised interrogation technique.", difficulty: "impossible" },
    { a: "let AI do your homework at a B grade", b: "grind it yourself for the A", percentA: 54, factoid: "The B-grade robot passes. The A costs your evenings. Choose your fighter.", difficulty: "medium" },
    { a: "get a snow day every Monday", b: "get two extra weeks of summer", percentA: 39, factoid: "52 snow days beats 14 summer days — but summer always polls better.", difficulty: "easy" },
  ],
  travel: [
    { a: "fly anywhere free but always middle seat", b: "fly first class but pay double", percentA: 48, factoid: "The middle seat deal is objectively better. Comfort still splits the vote.", difficulty: "medium" },
    { a: "speak every language", b: "visit every country", percentA: 56, factoid: "There are 195 countries and 7,000 languages. One option is a shortcut.", difficulty: "easy" },
    { a: "live at the beach forever", b: "live in the mountains forever", percentA: 51, factoid: "The true 50/50 — geography's civil war since forever.", difficulty: "easy" },
    { a: "lose your luggage on every trip", b: "have your phone die at every airport", percentA: 44, factoid: "Airlines mishandle 25 million bags a year. It could be you, every time.", difficulty: "medium" },
    { a: "be a tourist in the past only", b: "be a tourist in the future only", percentA: 47, factoid: "The past has no wifi. The future has no reviews. Good luck.", difficulty: "hard" },
    { a: "live in a new city every year", b: "live in one city with free monthly trips", percentA: 39, factoid: "Serial movers report more adventure AND more loneliness. Pick your poison.", difficulty: "medium" },
    { a: "road trip with no map", b: "fly with three layovers", percentA: 62, factoid: "Getting lost on purpose is a holiday. Layover four is a hostage situation.", difficulty: "medium" },
    { a: "see the northern lights once", b: "have every sunset be twice as good forever", percentA: 43, factoid: "You get roughly 27,000 sunsets in a lifetime. Compounding wins.", difficulty: "easy" },
    { a: "cruise with no wifi", b: "camp with full 5G", percentA: 33, factoid: "67% bring the internet to the woods. The woods deserved better.", difficulty: "easy" },
    { a: "get upgraded at every hotel but miss breakfast", b: "get a normal room and a legendary buffet", percentA: 41, factoid: "The buffet-first voters have never been wrong about anything.", difficulty: "medium" },
    { a: "teleport home instantly from any trip", b: "never feel jetlag again", percentA: 58, factoid: "The teleport is also an escape button from every bad holiday.", difficulty: "medium" },
    { a: "explore the deep sea", b: "explore deep space", percentA: 37, factoid: "We've mapped more of Mars than our own ocean floor.", difficulty: "hard" },
    { a: "take amazing trips you barely remember", b: "take average trips you remember perfectly", percentA: 46, factoid: "Psychologists say the remembering self runs your happiness. Choose it.", difficulty: "hard" },
    { a: "have every trip be a surprise destination", b: "plan everything with zero surprises", percentA: 59, factoid: "Surprise-trip companies exist and have five-star reviews. And lawyers.", difficulty: "medium" },
    { a: "eat only local food with no translations", b: "eat familiar food everywhere you go", percentA: 64, factoid: "Menu roulette produces the best travel stories ever told.", difficulty: "easy" },
  ],
  luxury: [
    { a: "own a superyacht you can't sail", b: "own a supercar in a gridlocked city", percentA: 42, factoid: "Both are furniture. One floats. That's the whole decision.", difficulty: "medium" },
    { a: "live in a mansion in the middle of nowhere", b: "live in a tiny flat in the best city on Earth", percentA: 47, factoid: "Estate agents say location three times for a reason.", difficulty: "medium" },
    { a: "have a £10k wardrobe with nowhere to go", b: "have one outfit but invites to everything", percentA: 31, factoid: "The invite list wins — clothes can be borrowed, rooms can't.", difficulty: "medium" },
    { a: "have a personal chef", b: "have a personal driver", percentA: 68, factoid: "You eat three times a day. You commute twice. Maths did this one.", difficulty: "easy" },
    { a: "have a diamond-crusted phone case", b: "have a battery that never dies", percentA: 8, factoid: "Only 8% pick the diamonds — flex loses to battery anxiety every time.", difficulty: "easy" },
    { a: "wear a Rolex that runs 5 minutes slow", b: "wear a £20 watch that's always right", percentA: 34, factoid: "A slow Rolex makes you late in style. The £20 watch just wins.", difficulty: "medium" },
    { a: "have an infinity pool that's always cold", b: "have a hot tub the size of a bath", percentA: 52, factoid: "Cold plunges are trendy now, which is the pool's only defence.", difficulty: "medium" },
    { a: "fly private twice a year", b: "fly business class every time", percentA: 44, factoid: "Frequent flyers pick business-always. Instagram picks the jet.", difficulty: "hard" },
    { a: "have a butler who judges you", b: "have a cleaner who rearranges everything", percentA: 56, factoid: "The judging is silent. The rearranging means you'll never find your keys again.", difficulty: "easy" },
    { a: "live in a penthouse with a broken lift", b: "live in a basement with a private cinema", percentA: 38, factoid: "40 floors of stairs is a fitness plan you didn't sign up for.", difficulty: "medium" },
    { a: "get free designer clothes one size off", b: "get perfect-fit clothes from the supermarket", percentA: 41, factoid: "Tailors exist — the designer deal is secretly playable.", difficulty: "medium" },
    { a: "own a £1M artwork you hate", b: "own a £100 print you love", percentA: 27, factoid: "You can sell the £1M painting. 73% still couldn't live with it.", difficulty: "easy" },
    { a: "have champagne taste on a tap-water budget", b: "have tap-water taste on a champagne budget", percentA: 28, factoid: "Being cheaply delighted is the actual cheat code for life.", difficulty: "hard" },
    { a: "have a gold bathroom", b: "have a marble kitchen", percentA: 35, factoid: "Estate agents: the kitchen sells the house. The gold loo sells a story.", difficulty: "easy" },
    { a: "eat five-star meals alone forever", b: "eat takeaway with your best mates forever", percentA: 24, factoid: "Food genuinely tastes better with company — it's called social facilitation.", difficulty: "easy" },
  ],
  general: [
    { a: "know when you'll die", b: "know how you'll die", percentA: 39, factoid: "Most pick 'how' — then immediately regret asking.", difficulty: "hard" },
    { a: "always say exactly what you think", b: "never speak again", percentA: 71, factoid: "The honesty option ends differently for everyone. Usually loudly.", difficulty: "medium" },
    { a: "restart life with all your memories", b: "take £10,000,000 right now", percentA: 44, factoid: "The restart is the richest option and the loneliest one.", difficulty: "hard" },
    { a: "never wait for anything again", b: "never lose anything again", percentA: 53, factoid: "You lose about 9 items a year and wait 6 months of your life in queues.", difficulty: "medium" },
    { a: "get free wifi everywhere forever", b: "get free coffee anywhere forever", percentA: 61, factoid: "Wifi wins the poll. Coffee wins the morning.", difficulty: "easy" },
    { a: "live to 150 in average health", b: "live to 80 in perfect health", percentA: 36, factoid: "Quality beats quantity in every survey ever run on this.", difficulty: "medium" },
    { a: "always be 10 minutes late", b: "always be 2 hours early", percentA: 42, factoid: "The 2-hours-early gang gets a lot of reading done.", difficulty: "medium" },
    { a: "fall asleep instantly", b: "wake up instantly refreshed", percentA: 48, factoid: "The rare true 50/50 — both teams think the other is mad.", difficulty: "easy" },
    { a: "delete one memory of your choice", b: "relive one day every year", percentA: 45, factoid: "The relive option compounds — that's 50+ perfect days.", difficulty: "hard" },
    { a: "have every joke land", b: "never embarrass yourself again", percentA: 57, factoid: "Comedians embarrass themselves professionally. The joke option includes it.", difficulty: "medium" },
    { a: "have your phone always at 100%", b: "have fuel be free forever", percentA: 39, factoid: "Free fuel is thousands a year. The battery is peace of mind. Money won.", difficulty: "easy" },
    { a: "know every fact but not why", b: "understand everything but forget the facts", percentA: 46, factoid: "One is a quiz champion, the other is a philosopher. Neither passes exams.", difficulty: "impossible" },
    { a: "have loud neighbours forever", b: "have a creak in your floor only you can hear at 3am", percentA: 62, factoid: "The private 3am creak is a psychological thriller with one viewer.", difficulty: "medium" },
    { a: "have autocorrect always wrong but funny", b: "have it always right but boring", percentA: 44, factoid: "Group chats secretly vote for the chaos option.", difficulty: "easy" },
    { a: "get one free 'undo' every day", b: "get one free 'skip' every day", percentA: 52, factoid: "Undo fixes the past. Skip dodges the dentist. Dead even.", difficulty: "hard" },
  ],
  funny: [
    { a: "honk instead of laughing", b: "hiccup every time you lie", percentA: 41, factoid: "The hiccup option is a walking lie detector. Your friends would LOVE it.", difficulty: "easy" },
    { a: "fight a kangaroo once", b: "get slapped by a fish every day for a year", percentA: 46, factoid: "Kangaroos kick with 750 pounds of force. The fish is just embarrassing.", difficulty: "medium" },
    { a: "have knees that moo", b: "have elbows that beep when you bend them", percentA: 52, factoid: "The moo is organic. The beep sounds like you're reversing.", difficulty: "medium" },
    { a: "sing everything you say", b: "dance everywhere you walk", percentA: 44, factoid: "The dancing commute burns 400 calories. The singing gets you a record deal or arrested.", difficulty: "medium" },
    { a: "wear clown shoes forever", b: "wear a tiny hat glued on forever", percentA: 38, factoid: "The tiny hat becomes your whole personality within a week.", difficulty: "medium" },
    { a: "sneeze confetti", b: "cry glitter", percentA: 57, factoid: "Confetti sneezes make every cold a celebration.", difficulty: "easy" },
    { a: "get applause every time you leave a room", b: "get a drumroll before everything you say", percentA: 48, factoid: "The drumroll adds pressure to 'pass the salt'. The applause is just rude.", difficulty: "easy" },
    { a: "sound like a chipmunk on every call", b: "sound like a movie villain in person", percentA: 43, factoid: "The villain voice wins job interviews. Terrifyingly.", difficulty: "medium" },
    { a: "only whisper dramatically", b: "only shout supportively", percentA: 39, factoid: "The supportive shouter is every sports parent already.", difficulty: "medium" },
    { a: "trip in front of your crush weekly", b: "call your teacher 'mum' monthly", percentA: 54, factoid: "Everyone has done one of these. Most have done both.", difficulty: "hard" },
    { a: "have spaghetti hair that regrows nightly", b: "sweat maple syrup", percentA: 61, factoid: "Spaghetti hair is infinite pasta. This is an economics question.", difficulty: "impossible" },
    { a: "laugh uncontrollably when nervous", b: "cry whenever you win anything", percentA: 47, factoid: "Nervous laughter is real — your brain literally can't decide.", difficulty: "medium" },
    { a: "have your phone read texts aloud in a posh accent", b: "have your alarm be a recording of your own snore", percentA: 58, factoid: "Hearing your own snore at 6am is a jump scare with a snooze button.", difficulty: "easy" },
    { a: "high-five everyone you meet (mandatory)", b: "bow to every dog you see", percentA: 36, factoid: "Bowing to dogs polls at 64% — honestly, they deserve it.", difficulty: "easy" },
    { a: "be invisible only in photos", b: "be audible only when singing", percentA: 49, factoid: "Invisible-in-photos means no ID, no passport, no proof you attended anything.", difficulty: "impossible" },
  ],
  random: [
    { a: "be 10 minutes early to everything forever", b: "get £10 every time you're late", percentA: 37, factoid: "The £10 option quietly builds a lateness salary. Chaos pays.", difficulty: "medium" },
    { a: "have a rewind button for conversations", b: "have a mute button for people", percentA: 44, factoid: "The mute button wins polls and loses friendships.", difficulty: "medium" },
    { a: "live in a world with no music", b: "live in a world with no films", percentA: 28, factoid: "Music wins 3-to-1 — nobody gives up their life's soundtrack.", difficulty: "easy" },
    { a: "only speak in rhymes", b: "only speak in questions", percentA: 51, factoid: "The questions-only life turns every chat into an interrogation, no?", difficulty: "medium" },
    { a: "have all your socks be slightly damp", b: "have all your pens barely work", percentA: 46, factoid: "The pen thing polls worse than damp socks. Humanity has spoken.", difficulty: "impossible" },
    { a: "have gravity be 10% weaker", b: "have time move 10% slower", percentA: 58, factoid: "10% weaker gravity adds about 4 inches to your vertical. Dunk season.", difficulty: "hard" },
    { a: "have everything you draw become real", b: "have everything you dream get recorded", percentA: 63, factoid: "Stick figures becoming real is a horror film with a crayon budget.", difficulty: "medium" },
    { a: "have a theme song that plays randomly", b: "have a laugh track that follows you", percentA: 55, factoid: "The laugh track during serious moments is a social death sentence.", difficulty: "easy" },
    { a: "never tangle a cable again", b: "never lose a sock again", percentA: 66, factoid: "Cable-tangle physics is a real research field. Socks remain a mystery.", difficulty: "easy" },
    { a: "talk to your future self for 5 minutes", b: "talk to your past self for 5 minutes", percentA: 52, factoid: "Future-you has the answers. Past-you won't listen anyway — you know you.", difficulty: "hard" },
    { a: "see wifi signals", b: "hear plants", percentA: 71, factoid: "Plants do emit ultrasonic clicks when stressed. You'd hear complaining.", difficulty: "medium" },
    { a: "blink twice as often", b: "breathe twice as loudly", percentA: 48, factoid: "You blink 15,000 times a day already. Nobody would notice. They'd hear you.", difficulty: "medium" },
    { a: "reset to age 10 with all your memories", b: "fast-forward to your best year", percentA: 43, factoid: "You don't get told WHICH year is your best. That's the gamble.", difficulty: "hard" },
    { a: "pause the world for an hour daily", b: "get an extra hour of sleep daily", percentA: 57, factoid: "The pause hour is 365 free hours a year. The sleep is... also that. Hmm.", difficulty: "medium" },
    { a: "have every lift play your guilty-pleasure song", b: "have your ringtone be your own voice", percentA: 41, factoid: "Hearing your own voice is universally hated — it's called voice confrontation.", difficulty: "easy" },
  ],
};

// ── Modifier expansion ───────────────────────────────────────────────────────

interface Modifier {
  text: string;
  target: "a" | "b" | "both";
  /** Applied to percentA — a downside on A pushes voters to B and vice versa. */
  delta: number;
}

const MODIFIERS: Modifier[] = [
  { text: "but you can never tell anyone", target: "a", delta: -9 },
  { text: "every day for a year", target: "a", delta: -7 },
  { text: "in front of your entire school", target: "a", delta: -11 },
  { text: "but it's permanent", target: "both", delta: 0 },
  { text: "but only on weekends", target: "a", delta: 8 },
  { text: "for the rest of your life", target: "both", delta: 0 },
  { text: "while everyone watches", target: "b", delta: 9 },
  { text: "starting tomorrow morning", target: "both", delta: 0 },
  { text: "but you must post it online", target: "a", delta: -6 },
  { text: "with your best friend watching", target: "b", delta: 5 },
  { text: "but nobody will ever believe you", target: "a", delta: -4 },
  { text: "and you can never undo it", target: "both", delta: 0 },
];

const DIFFICULTY_ORDER: WyrDifficulty[] = ["easy", "medium", "hard", "impossible"];

function difficultyDistance(a: WyrDifficulty, b: WyrDifficulty): number {
  return Math.abs(DIFFICULTY_ORDER.indexOf(a) - DIFFICULTY_ORDER.indexOf(b));
}

/**
 * Poll numbers that read as real: never a multiple of 5 (52, not 50), nudged
 * deterministically per question so re-generation is stable.
 */
function naturalizePercent(p: number, seed: number): number {
  const rand = seededRandom(seed || 1);
  let out = clamp(Math.round(p), 3, 97);
  if (out % 5 === 0) {
    const nudge = 1 + Math.floor(rand() * 3);
    out = clamp(out + (rand() > 0.5 ? nudge : -nudge), 3, 97);
    if (out % 5 === 0) out = clamp(out + 1, 3, 97);
  }
  return out;
}

function applyModifier(pair: BankPair, mod: Modifier): { a: string; b: string; percentA: number } {
  const a = mod.target === "b" ? pair.a : `${pair.a} — ${mod.text}`;
  const b = mod.target === "a" ? pair.b : `${pair.b} — ${mod.text}`;
  return { a, b, percentA: naturalizePercent(pair.percentA + mod.delta, fnv1a(`${a}|${b}`)) };
}

/**
 * Pure combinatorial expansion of the bank for one request. Returns base pairs
 * plus every modifier variant, seeded-shuffled, difficulty-matched pairs first.
 *
 * breadth 0 → only exact-difficulty pairs of the theme
 * breadth 1 → all pairs of the theme, exact difficulty ordered first (default)
 * breadth 2 → the entire bank across all themes (last-resort top-up)
 */
export function expandBank(
  theme: string,
  difficulty: string,
  seed: number,
  breadth: 0 | 1 | 2 = 1,
): WyrQuestionT[] {
  const wantDifficulty: WyrDifficulty = DIFFICULTY_ORDER.includes(difficulty as WyrDifficulty)
    ? (difficulty as WyrDifficulty)
    : "medium";

  const allPairs: BankPair[] = [];
  if (breadth >= 2 || theme === "random" || !BANK[theme]) {
    for (const key of Object.keys(BANK)) allPairs.push(...BANK[key]);
  } else {
    allPairs.push(...BANK[theme]);
  }

  const pairs =
    breadth === 0
      ? allPairs.filter((p) => p.difficulty === wantDifficulty)
      : [...allPairs].sort(
          (x, y) =>
            difficultyDistance(x.difficulty, wantDifficulty) -
            difficultyDistance(y.difficulty, wantDifficulty),
        );

  const out: WyrQuestionT[] = [];
  for (const pair of pairs) {
    out.push({
      theme,
      difficulty: wantDifficulty,
      optionA: pair.a,
      optionB: pair.b,
      percentA: pair.percentA,
      factoid: pair.factoid || undefined,
    });
    for (const mod of MODIFIERS) {
      const variant = applyModifier(pair, mod);
      out.push({
        theme,
        difficulty: wantDifficulty,
        optionA: variant.a,
        optionB: variant.b,
        percentA: variant.percentA,
        factoid: pair.factoid || undefined,
      });
    }
  }

  // Deterministic Fisher-Yates so different (user, channel, attempt) seeds
  // surface different corners of the pool.
  const rand = seededRandom(seed || 1);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Total number of distinct candidate pairs the bank can produce. */
export function bankSize(): number {
  let base = 0;
  for (const key of Object.keys(BANK)) base += BANK[key].length;
  return base * (MODIFIERS.length + 1);
}

// ── AI branch ────────────────────────────────────────────────────────────────

interface AiWyrPair {
  optionA?: unknown;
  optionB?: unknown;
  percentA?: unknown;
  factoid?: unknown;
}

async function aiWyrCandidates(
  theme: string,
  difficulty: WyrDifficulty,
  count: number,
): Promise<WyrQuestionT[]> {
  const parsed = await aiCompleteJson<{ questions?: AiWyrPair[] } | AiWyrPair[]>({
    system:
      "You write would-you-rather questions for viral YouTube Shorts. Punchy, visual, funny — never generic. British English.",
    prompt: `Write ${count} fresh would-you-rather pairs. Theme: "${theme}". Difficulty: "${difficulty}" (impossible = agonising trade-offs). Respond as JSON: {"questions":[{"optionA":"...","optionB":"...","percentA":<2-98>,"factoid":"one punchy fun fact for the reveal"}]}. percentA rules: NEVER a multiple of 5 (looks fake) — use organic numbers like 23, 37, 61, 78, 84; vary widely across the set (mix blowouts like 19/81 with nail-biters like 48/52). Options must be short (under 12 words), start lowercase, and contain no "would you rather" prefix.`,
    maxTokens: 1800,
  });

  const rawList: AiWyrPair[] = Array.isArray(parsed) ? parsed : (parsed.questions ?? []);
  const out: WyrQuestionT[] = [];
  for (const item of rawList) {
    const optionA = typeof item.optionA === "string" ? item.optionA.trim() : "";
    const optionB = typeof item.optionB === "string" ? item.optionB.trim() : "";
    if (!optionA || !optionB || optionA.toLowerCase() === optionB.toLowerCase()) continue;
    const percentA = naturalizePercent(
      clamp(Math.round(Number(item.percentA)) || 50, 2, 98),
      fnv1a(`${optionA}|${optionB}`),
    );
    out.push({
      theme,
      difficulty,
      optionA,
      optionB,
      percentA,
      factoid: typeof item.factoid === "string" && item.factoid.trim() ? item.factoid.trim() : undefined,
    });
  }
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;

/**
 * Generate `count` never-seen-before questions for a channel. Candidates come
 * from the AI provider when configured (bank as backfill), otherwise entirely
 * from the deterministic bank. Every accepted question is persisted with its
 * unique hash, so the whole account can never be served a duplicate.
 */
export async function generateWyrQuestions(
  userId: string,
  channelId: string,
  theme: string,
  difficulty: string,
  count: number,
): Promise<WyrQuestionT[]> {
  const wanted = clamp(Math.floor(count) || 1, 1, 20);
  const normTheme = (WYR_THEMES as readonly string[]).includes(theme) ? theme : "random";
  const normDifficulty: WyrDifficulty = DIFFICULTY_ORDER.includes(difficulty as WyrDifficulty)
    ? (difficulty as WyrDifficulty)
    : "medium";

  const picked: WyrQuestionT[] = [];
  const seenHashes = new Set<string>();

  for (let attempt = 0; attempt < MAX_ATTEMPTS && picked.length < wanted; attempt++) {
    let candidates: WyrQuestionT[] = [];

    if (!isMockAi()) {
      try {
        candidates = await aiWyrCandidates(normTheme, normDifficulty, wanted * 2);
      } catch (err) {
        log.warn(
          `AI question generation failed (attempt ${attempt + 1}) — using bank: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const breadth: 0 | 1 | 2 = attempt >= 2 ? 2 : 1;
    const seed = fnv1a(`${userId}:${channelId}:${normTheme}:${normDifficulty}:${attempt}`);
    candidates = candidates.concat(expandBank(normTheme, normDifficulty, seed, breadth));

    // Hash every candidate and drop in-run repeats, then check the DB in
    // chunks (SQLite caps bound variables, and we usually stop after the
    // first chunk anyway).
    const hashed = candidates
      .map((q) => ({ q, hash: wyrHash(q.optionA, q.optionB) }))
      .filter(({ hash }) => !seenHashes.has(hash));

    const CHUNK = 150;
    for (let offset = 0; offset < hashed.length && picked.length < wanted; offset += CHUNK) {
      const chunk = hashed.slice(offset, offset + CHUNK);
      const existing = await prisma.wyrQuestion.findMany({
        where: { hash: { in: [...new Set(chunk.map((h) => h.hash))] } },
        select: { hash: true },
      });
      const taken = new Set(existing.map((e) => e.hash));

      for (const { q, hash } of chunk) {
        if (picked.length >= wanted) break;
        if (taken.has(hash) || seenHashes.has(hash)) continue;
        seenHashes.add(hash);
        try {
          const row = await prisma.wyrQuestion.create({
            data: {
              channelId,
              theme: q.theme,
              difficulty: q.difficulty,
              optionA: q.optionA,
              optionB: q.optionB,
              percentA: q.percentA,
              factoid: q.factoid ?? "",
              hash,
            },
          });
          picked.push({
            id: row.id,
            theme: row.theme,
            difficulty: row.difficulty as WyrDifficulty,
            optionA: row.optionA,
            optionB: row.optionB,
            percentA: row.percentA,
            factoid: row.factoid || undefined,
          });
        } catch {
          // Unique-hash race (another request inserted it first) — skip and move on.
        }
      }
    }
  }

  if (picked.length < wanted) {
    throw new Error(
      `Only ${picked.length}/${wanted} unique questions available for theme "${normTheme}" — this channel has exhausted the pool. Try another theme or difficulty.`,
    );
  }
  return picked;
}

/** Stamp questions as consumed by a project so they are never re-served. */
export async function markQuestionsUsed(ids: string[], projectId: string): Promise<void> {
  if (ids.length === 0) return;
  await prisma.wyrQuestion.updateMany({
    where: { id: { in: ids } },
    data: { usedAt: new Date(), projectId },
  });
}
