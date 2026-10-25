// VoxelVenture's policies (/legal): terms, privacy, refunds, advertising, retention and merchant responsibilities.
//
// DRAFTS. They describe what the code does today (sources: docs/monetization/policy_review.md), but they are not legal advice and have not been
// reviewed by a lawyer. While POLICY_STATUS.status is 'draft' every page says so, is kept out of search engines, and shows the "For review"
// notes; the [placeholders] come from lib/legal/operator.js. Approving them is a code change (status 'approved', an effective date), which
// tests/legal.test.mjs refuses while any placeholder or review note is left.
//
// A policy is { slug, title, summary, sections: [{ id, heading, blocks }] }; a block is a paragraph (string), { list: [...] },
// { table: { head, rows } } or { review: 'a note for the reviewer' }.
import { operator } from './operator';
import { BROWSER_STORAGE, LIMITS, MONEY, RETENTION } from './facts';

export const POLICY_STATUS = { status: 'draft', version: '0.1', drafted: '2026-10-17', effective: null };

const list = (...items) => ({ list: items });
const table = (head, rows) => ({ table: { head, rows } });
const review = (text) => ({ review: text });

export function policies(o = operator()) {
  const contact = `Write to ${o.email}.`;
  const writeTo = `write to ${o.email}.`; // the same, inside a sentence
  return [
    // ---------------------------------------------------------------------------------------------------------------------------
    {
      slug: 'terms',
      title: 'Terms of service',
      summary: 'The rules for using VoxelVenture: accounts, what you may post, the game, paid products, and our responsibilities.',
      sections: [
        { id: 'who', heading: 'Who we are', blocks: [`VoxelVenture is run by ${o.name}, ${o.address} ("we", "us"). These terms apply when you use the VoxelVenture website, its business pages and its 3D city. ${contact}`] },
        {
          id: 'service',
          heading: 'What VoxelVenture is',
          blocks: [
            'VoxelVenture is a free directory of independent businesses, with a page for each, and an optional 3D city game where businesses have buildings people can walk into.',
            'You can look around without an account. You need one to list a business, claim a building, buy a placement, post on a feedback board, vote for Building of the Week, or chat and send messages.',
          ],
        },
        {
          id: 'accounts',
          heading: 'Your account',
          blocks: [
            list(
              `You must be at least ${o.minAge} years old to create an account.`,
              'Keep your password to yourself. You are responsible for what is done with your account.',
              `A sign-in lasts ${RETENTION.sessionDays} days on a device, or until you sign out.`,
              `One person may list up to ${LIMITS.profilesPerAccount} businesses.`,
              'Your account name is shown publicly next to what you do: your buildings, your posts, your market stalls and your chat messages.',
            ),
            review('Decide the minimum age (13, 16 or 18) and whether chat and private messages need a higher one. There is no age check in the product today.'),
          ],
        },
        {
          id: 'content',
          heading: 'What you post',
          blocks: [
            'You keep the rights to what you post: business details, logos, offers, feedback, chat and messages. You allow us to store it, show it on VoxelVenture and in the game, and include it in things like the Discover page, share images and, if you ask for it, a welcome post on our X account. This lasts as long as the content is on VoxelVenture.',
            'You must have the right to post it, and it must be true. Do not post anything that:',
            list(
              'is illegal, or helps someone break the law;',
              'is sexual, hateful, harassing or threatening, or encourages harm;',
              'is spam, a scam, or misleads people about who you are or what you sell;',
              "copies someone else's work, brand or identity without permission;",
              'carries malware or tries to break or overload the service.',
            ),
            'Everything written is checked by an automatic filter first (it refuses some words, too many links, and text in all capitals). Anyone signed in can report content. Our moderators can remove content and suspend or ban an account. A banned account is signed out everywhere.',
            review('Name who moderates, how fast reports are looked at, and how someone appeals a ban.'),
          ],
        },
        {
          id: 'game',
          heading: 'The 3D city and its game',
          blocks: [
            list(
              'Gold (earned exploring) and Credits (earned from visit quests) are game points. They have no money value, cannot be bought, sold, transferred or cashed in, and can change or be reset.',
              'Buildings, plots, ad spaces and stalls in the city are places in a game. Claiming one gives you a game tenancy, not ownership of anything real.',
              `When a building's game lease ends and its grace period (${MONEY.graceDays} days) has passed, another player can take it over. The previous holder gets no real money for it: the payout the game shows and emails is game value only.`,
              'Other players see your account name or chosen name, your outfit and where you are in the city while you are online.',
            ),
          ],
        },
        {
          id: 'paid',
          heading: 'Paid products',
          blocks: [
            `Some things cost real money: the ${MONEY.launch.name}, ${MONEY.pro.name}, sponsored placements, and, when billing is switched on, building leases and market stalls. Prices are in ${MONEY.currency} and shown before you pay. Payments are handled by Stripe; we never see your card.`,
            'The refund and cancellation policy explains what happens if you stop, change your mind or something goes wrong. The advertising policy has the rules for placements.',
            `We sometimes give out promo codes for a discount on what we sell. The refund and cancellation policy has their rules: ${MONEY.promo.perCheckout} code per checkout, no cash value, a ${MONEY.pro.name} code covers the first ${MONEY.pro.interval} only, and we can withdraw or change a code.`,
          ],
        },
        {
          id: 'businesses',
          heading: 'If you list a business',
          blocks: ["You must follow the merchant responsibilities: keep your page accurate, honour your offers and coupons, and handle the details customers send you lawfully."] },
        {
          id: 'availability',
          heading: 'Availability and changes',
          blocks: [
            'We work to keep VoxelVenture running, but it is provided as it is and may sometimes be unavailable, change or lose features. We may change prices for future purchases; what you have already paid for runs as bought.',
            'We may change these terms. If a change matters, we will say so on the site before it applies.',
          ],
        },
        {
          id: 'liability',
          heading: 'Our responsibility to you',
          blocks: [
            'Nothing in these terms limits rights you have by law that cannot be limited.',
            `Otherwise, we are not responsible for losses that were not foreseeable, for business losses, or for what other users post or do. Our total responsibility to you is limited to [amount: for example what you paid us in the 12 months before the claim].`,
            review('Liability cap, consumer-law carve-outs and any indemnity need legal review for the countries you sell in.'),
          ],
        },
        {
          id: 'ending',
          heading: 'Ending',
          blocks: [`You can stop using VoxelVenture at any time. To close your account, ${writeTo} We may suspend or close an account that breaks these terms.`, review('There is no "delete my account" button yet: closing an account is done by hand on request.')],
        },
        { id: 'law', heading: 'Law and disputes', blocks: [`These terms are governed by ${o.jurisdiction}. If you have a problem, write to us first and we will try to sort it out.`] },
      ],
    },
    // ---------------------------------------------------------------------------------------------------------------------------
    {
      slug: 'privacy',
      title: 'Privacy policy',
      summary: 'What VoxelVenture collects, why, who sees it, how long it is kept, and what you can do about it.',
      sections: [
        { id: 'who', heading: 'Who is responsible', blocks: [`${o.name}, ${o.address}, decides how your information is used ("we"). For anything in this policy, ${writeTo}`, review('Name a data protection contact or representative if the law where you operate requires one.')] },
        {
          id: 'collect',
          heading: 'What we collect',
          blocks: [
            table(
              ['What', 'When', 'Why'],
              [
                ['Account name and password (stored only as a salted scrypt hash)', 'You create an account', 'To sign you in and show your name next to what you do'],
                ['Email address (optional)', 'You add one', 'To confirm it, then send notices about your buildings, leases, market stalls and requests, and the Plot of the Day'],
                ['Business details: name, category, district, description, website, call to action, offer, logo, X handle', 'You list a business', 'To publish your business page'],
                ['Meeting and quote requests: name, email, phone (optional), message, preferred time', 'You send a request to a business', 'To pass it to that business so it can reply, and to count it in its figures'],
                ['Newsletter sign-ups to a business: email', 'You sign up and confirm by email', 'So that business can write to you'],
                ['Coupon claims, votes, quests, feedback posts, market stalls', 'You use these', 'To run them, show them where they are public, and prevent cheating'],
                ['The steps you take towards a plot in the city: opening its card, starting to set it up (which holds it for you for three minutes), the price and lease term you were shown, starting to pay, and whether you claimed it, took it over or let it go. With your account, or else your visitor number scrambled one way, and a scrambled form of your network address', 'You look at or set up a plot', 'To hold a plot for one player at a time, and to learn which locations people want and at what price, so plot prices can follow real demand. Only our staff see it, as totals'],
                ['The plots you choose to watch', 'You press Watch on a plot', 'To email you when its lease ends, when it opens to a buyout and when someone takes it over. The tenant sees how many people watch their plot, never who; our staff can see who watches a plot'],
                ['Which squares of the city map you walked or drove through outdoors, counted once an hour (not where exactly, and not when to the minute)', 'You play the 3D city', 'To count how many people pass each street, as totals per day. Who passed is kept only in a scrambled form, for two days, so that a person is counted once'],
                ['Chat and private messages', 'You chat or send a message', 'To deliver them, and to check reports of abuse'],
                ['Where you are in the city, your outfit and name, your device type, screen size, browser and errors, with a one-way scrambled form of your network address', 'You play the 3D city', 'So other players see you, and so we can fix problems on your device'],
                ['A random visitor number, the country you visit from, and a one-way scrambled form of your network address', 'You visit pages', 'To count real visits once, keep robots and repeat clicks out of the figures businesses see, and show how many people are online'],
                ['The referral code of a link you followed, a campaign tag, and a click number added to a business\'s button', 'You follow or press a link', 'To credit the person or campaign that brought you, and the business for sales that follow'],
                ['Payments: what you bought, when, and Stripe\'s reference numbers', 'You pay', 'To give you what you paid for, handle refunds and keep accounts. Your card details go to Stripe, not to us'],
                ['A log of important actions (sign-ups, claims, purchases, refunds, moderation)', 'Those actions happen', 'Security and accountability. This log cannot be edited or deleted'],
                ['For our staff: an email address on their admin account (optional)', 'A staff member adds one and confirms it', 'Only to email them a link to reset a forgotten admin password, and to tell the old address when it changes'],
                ['For business owners: the weeks you used your dashboard and, if your business is in the pilot, your weekly check-in answers', 'You open your dashboard or change your profile; you send a check-in', 'To learn whether VoxelVenture is useful to businesses and what to build next. Only our staff see the answers'],
              ],
            ),
            'We do not use advertising trackers or third-party analytics.',
            'We never store your network address as it is: wherever it is kept (visit figures, error reports, the monitor), it is scrambled with a secret first, so it cannot be read back.',
          ],
        },
        {
          id: 'public',
          heading: 'What others can see',
          blocks: [
            list(
              'Everyone: business pages; the account name of each building or stall owner; feedback posts with their author; Building of the Week tallies (not who voted).',
              'Other players near you: your name, outfit, position and what you say in nearby chat.',
              'The people in a conversation: its messages. Messages are protected in transit (HTTPS) and only members can open them, but they are not end-to-end encrypted: if a message is reported, a moderator can read it.',
              'A business you contact or sign up to: the details you send it. Coupon claims and visits are counted, not named.',
              'The tenant of a plot you watch: how many people watch it, never who. Our staff can see who watches a plot.',
            ),
          ],
        },
        {
          id: 'share',
          heading: 'Who else we share it with',
          blocks: [
            table(
              ['Who', 'What and why'],
              [
                ['Stripe', 'What you buy, the amount, and your email if you confirmed one: to take payment and handle refunds'],
                ['Our email provider', 'Each email we send, including the details of a request passed to a business: to deliver it'],
                ['A content-checking service (only if we switch one on)', 'Text and logo images you post, and chat messages: to catch abuse'],
                ['X (only if you tick the box)', 'A welcome post with your business name and X handle'],
                ['Our hosting provider', 'Everything, stored on our servers'],
                ['Sentry (error reporting)', 'When something goes wrong on the site or our servers: the error, the page or address it happened on, and the app version. Not your name, email or network address'],
              ],
            ),
            'When you open a building in the 3D city, your browser also downloads furniture models from Supabase and a decoder from Google (gstatic), and a business\'s embedded video loads from YouTube (privacy-enhanced mode), Vimeo or itch.io. Those services see your network address.',
            'We do not sell your information.',
            review('Name the hosting and email providers. Add international transfer wording if they are in other countries.'),
          ],
        },
        {
          id: 'storage',
          heading: 'What we keep in your browser',
          blocks: [
            'VoxelVenture sets no cookies for players and visitors. (Its own staff get one sign-in cookie on the admin pages; see the data retention policy.) It keeps these in your browser\'s local storage:',
            table(['What', 'Why', 'Needed for the site to work?'], BROWSER_STORAGE.map((s) => [s.keys.join(', '), s.what, s.needed ? 'Yes' : 'No'])),
            'You can clear them in your browser\'s settings; the game in that browser starts again from scratch.',
            review('Decide whether the visitor number and referral code need consent before they are stored where you operate (they are not strictly needed). If so, a consent prompt must be added.'),
          ],
        },
        {
          id: 'keep',
          heading: 'How long we keep it',
          blocks: ['See the data retention policy for each kind of information.'],
        },
        {
          id: 'rights',
          heading: 'Your choices and rights',
          blocks: [
            'You can, yourself:',
            list(
              'change or remove your email address, and turn notices off (in your account);',
              'unsubscribe from a business\'s newsletter with the link in each email;',
              'block people, mute conversations and turn message requests off;',
              'hide a player for your visit, and report content.',
            ),
            `For anything else (a copy of your information, correcting it, deleting your account and what you posted, or objecting to how we use it), ${writeTo} We answer within [30] days. Some things we must keep, such as payment records and the action log.`,
            review('There is no self-service account deletion or data export yet, and account holders get the Plot of the Day newsletter unless they turn notices off (opt-out). Both may need to change where you operate.'),
          ],
        },
        {
          id: 'security',
          heading: 'Keeping it safe',
          blocks: ['Passwords are stored as salted scrypt hashes, sign-ins as hashes, network addresses scrambled with a secret before they are stored, and conversion keys as hashes. The site uses HTTPS, and our services talk to each other only with secrets and on private addresses.'],
        },
        { id: 'children', heading: 'Children', blocks: [`VoxelVenture is not meant for children under ${o.minAge}. If you think a child has given us information, ${writeTo}`] },
        { id: 'changes', heading: 'Changes', blocks: ['If we change this policy in a way that matters, we will say so on the site before it applies.'] },
      ],
    },
    // ---------------------------------------------------------------------------------------------------------------------------
    {
      slug: 'refunds',
      title: 'Refunds and cancellation',
      summary: 'What each paid product includes, how to stop it, and when you get your money back.',
      sections: [
        {
          id: 'products',
          heading: 'What you can buy',
          blocks: [
            table(
              ['Product', 'Price', 'What you get'],
              [
                [MONEY.launch.name, MONEY.launch.price, `${MONEY.launch.days} days of launch features for one business page`],
                [MONEY.pro.name, `${MONEY.pro.price} a ${MONEY.pro.interval}`, 'Pro features for one business page, renewed each month until you stop it'],
                ...MONEY.placements.map((p) => [`Sponsored: ${p.label}`, `${p.price} a week`, `A labelled "Sponsored" spot for ${p.days} days (up to ${p.slots} businesses share a page)`]),
                ['Building lease (when billing is on)', 'Shown before you pay', `A game lease of ${MONEY.leaseTerms.join(', ').replace(/, ([^,]*)$/, ' or $1')} days on a building in the 3D city; renewing costs ${Math.round(MONEY.renewalShare * 100)}% of a new lease, and an account with ${MONEY.pro.name} pays ${Math.round(MONEY.proPlotDiscount * 100)}% less for a lease, a take-over or a renewal`],
                ['Building upgrade (when billing is on)', 'Shown before you pay', 'Extra floors, or a roof garden, glass dome or spire, on your leased building for the rest of its lease (the basic outside is free)'],
                ['Market stall (when billing is on)', MONEY.stallPrices.map((s) => `${s.label} ${s.price}`).join(', '), `A stall for ${MONEY.stallHours.join(', ')} hours; up to ${MONEY.stallsPerWeek} a week per account`],
              ],
            ),
            `Prices are in ${MONEY.currency}. While you are at checkout, the spot you chose is held for ${MONEY.checkoutHoldMinutes} minutes. Stripe emails your receipt.`,
            `You can also put several of these in your cart and pay for them together, in one payment of at least ${MONEY.cart.minimum} (up to ${MONEY.cart.maxPlots} buildings at a time). Prices are checked again when you check out, and if one has changed you see the new price before you pay. Checking out holds everything in the cart for ${MONEY.checkoutHoldMinutes} minutes; if something can no longer be had, nothing is held and you are told what. With ${MONEY.pro.name} in the cart, your leases in the same payment already get the ${MONEY.pro.name} price, ${MONEY.pro.name} renews each ${MONEY.pro.interval} from then on, and the leases keep that price even if ${MONEY.pro.name} is later stopped or refunded.`,
            review('Say whether prices include sales tax or VAT, and add tax wording if needed.'),
          ],
        },
        {
          id: 'promo',
          heading: 'Promo codes',
          blocks: [
            'We sometimes give out promo codes for a discount on what we sell. These are our own codes; they are not the coupons businesses offer their customers on their pages.',
            list(
              `${MONEY.promo.perCheckout === 1 ? 'One code' : `${MONEY.promo.perCheckout} codes`} per checkout (a single purchase or one cart). A code cannot be combined with another code.`,
              'Each code says what it covers (for example building leases, or the Launch Pack), how much it takes off, and any conditions: a minimum total, an end date, how many times it can be used, or first purchases only. It comes off after any other discount, such as the Pro price for leases or the renewal price.',
              `A code for ${MONEY.pro.name} covers the first ${MONEY.pro.interval} only. ${MONEY.pro.name} then renews at its full price (${MONEY.pro.price} a ${MONEY.pro.interval}) until you stop it, so we ask for a card even when the first ${MONEY.pro.interval} is free.`,
              `A code never leaves less than ${MONEY.promo.smallestCharge} to pay (the payment processor's minimum), unless it makes the purchase free. A purchase a code makes free needs no card and has no receipt from Stripe.`,
              'A code has no cash value. It cannot be exchanged for money, Gold or anything else, or sold.',
              'A code counts as used while a checkout with it is open, and once that purchase is paid. If the checkout is abandoned the code can be used again. If the purchase is refunded in full, the code can be used again.',
              'We can withdraw or change a code at any time, and refuse one that was shared or used in a way it was not meant for. A change does not affect a purchase already paid.',
              'Too many wrong codes in a short time pause code checks for a while.',
            ),
          ],
        },
        {
          id: 'cancel',
          heading: 'Stopping Pro',
          blocks: ['Stop Pro at any time from your business page. It keeps working until the end of the month you have paid for, then your page goes back to the free plan. You are not charged again.'],
        },
        {
          id: 'refunds',
          heading: 'When you get a refund',
          blocks: [
            'Refunds are always the full amount you paid for what is refunded (less any promo code, which was never paid), to the card you paid with.',
            list(
              'Automatically, if we cannot give you what you paid for (for example the spot was taken by someone else at the same moment). If you paid for several things together in your cart, only that item is refunded, for its own price; the rest goes ahead.',
              'If you cancel a market stall booking before the stall opens.',
              `If something you paid for did not work as described: write to ${o.email} within [14] days.`,
              'Where the law gives you a right to a refund.',
            ),
            'Once a week of placement or launch has started, or a Pro month has begun, we do not refund the time already used, except as above.',
            review('Decide the refund window for "did not work" claims, whether a part-used week is refunded, and whether a cooling-off right applies to your customers (it often does for consumers buying online).'),
          ],
        },
        {
          id: 'effects',
          heading: 'What a refund takes back',
          blocks: [
            list(
              'A placement, Launch Pack or Pro stops at once.',
              'A building lease ends and the building opens to other players.',
              'A market stall booking is released.',
              'A lease renewal loses the days it added.',
            ),
          ],
        },
        {
          id: 'disputes',
          heading: 'Disputed payments',
          blocks: [
            `Please write to us before disputing a payment with your bank. ${contact} If a payment is disputed, we look at it by hand and may pause what it paid for while the dispute is open.`,
            review('Disputes (chargebacks) are not yet handled by the system: they are only recorded. Partial refunds made in Stripe are also ignored. Decide the process and build it before taking live payments.'),
          ],
        },
      ],
    },
    // ---------------------------------------------------------------------------------------------------------------------------
    {
      slug: 'advertising',
      title: 'Advertising and sponsored placement',
      summary: 'What can be promoted on VoxelVenture, how sponsored spots are labelled, and how ads are checked.',
      sections: [
        {
          id: 'what',
          heading: 'What is sold',
          blocks: [
            list(
              ...MONEY.placements.map((p) => `${p.label}: ${p.price} a week, at most ${p.slots} sponsored businesses at a time.`),
              `The ${MONEY.launch.name}: a week in "New this week" at the top of Discover.`,
              'Market stalls in the 3D city (when billing is on).',
            ),
            'Every sponsored spot is clearly labelled "Sponsored", and a launch "New this week". Paying never changes the figures a business sees, the search results order, or Building of the Week.',
          ],
        },
        {
          id: 'city',
          heading: 'Billboards and banners in the 3D city',
          blocks: [
            'Billboards and towed banners in the city are part of the game: no real money is charged for them today. Another player can take a space over for 1.25 times its game value, which replaces your ad. Their figures start again for the new advertiser.',
            review('Ad spaces are not charged even when billing is on. Decide whether they should be (and then they belong in the refund policy), or keep them as a game feature as written here.'),
          ],
        },
        {
          id: 'rules',
          heading: 'What may be promoted',
          blocks: [
            'Ads, placements, offers and stalls must follow the terms of service, and must:',
            list(
              'be honest: real prices, real offers, no fake reviews or urgency;',
              'link only to an https website you are allowed to promote;',
              'say clearly what you are selling, and who you are.',
            ),
            'Not allowed: anything illegal; adult content; weapons; gambling; crypto giveaways or "get rich" schemes; medical, financial or legal claims you cannot back up; and anything that targets children.',
            'Links are limited per field (for example none in a headline, one in a tagline), and videos can only be embedded from YouTube, Vimeo or itch.io.',
            review('Confirm the list of banned and restricted categories (for example alcohol, supplements, financial products) for the countries you sell in.'),
          ],
        },
        {
          id: 'checks',
          heading: 'How ads are checked',
          blocks: [
            'Every ad is checked by the automatic filter when it is posted. Anyone signed in can report it as spam, offensive or misleading. A moderator can remove it, and ban the account behind it.',
            'A placement removed because it broke these rules is [not refunded / refunded for the unused days].',
            review('Choose the refund rule for removed ads.'),
          ],
        },
        {
          id: 'figures',
          heading: 'The figures we report',
          blocks: [
            'Businesses see verified figures only: robots, their own visits and repeat clicks from one network are left out. Outcomes are shown in separate kinds (leads, coupon claims, coupons redeemed, purchases), each with its own cost, and never added into one total. Revenue is shown in three parts: verified, unattributed, and browser-reported (which cannot be verified).',
            `A sale is credited to a press of the business's button up to ${RETENTION.attributionDays} days before it. We do not promise any number of visits, leads or sales.`,
          ],
        },
      ],
    },
    // ---------------------------------------------------------------------------------------------------------------------------
    {
      slug: 'retention',
      title: 'Data retention',
      summary: 'How long VoxelVenture keeps each kind of information, and what is removed when.',
      sections: [
        {
          id: 'table',
          heading: 'How long we keep things',
          blocks: [
            table(
              ['Information', 'Kept for', 'Then'],
              [
                ['Your account and email', 'While your account is open', `Removed when you ask us to close it (${o.email})`],
                ['A sign-in on a device', `${RETENTION.sessionDays} days`, 'It stops working'],
                ['Meeting and quote requests sent to a business', `${RETENTION.inquiryDays} days`, 'The name, email, phone and message are wiped (and the email that told the business is deleted); that a request happened is kept for the figures'],
                ['Nearby chat', `${RETENTION.nearbyDays} days`, `The text is wiped; the record is deleted after ${RETENTION.nearbyDeleteDays} days, unless it was reported`],
                ['Private messages', `${RETENTION.inboxDays} days`, 'The text is wiped; that a message was sent is kept'],
                ['A copy of a reported message', `Until the report is decided, then ${RETENTION.reportEvidenceDays} days`, 'Wiped'],
                ['Who is online now', `${RETENTION.presenceDays} day`, 'Deleted'],
                ['Chat sign-in tickets', `${RETENTION.ticketSeconds} seconds, one use`, 'Deleted'],
                ['Multiplayer error reports (with a scrambled network address)', `Until the log reaches ${RETENTION.errorLogBytes / 1_000_000} MB, then one older copy`, 'Overwritten'],
                ['Visits, button presses, purchases reported by businesses, votes, coupon claims, feedback posts', 'While the service runs', 'Kept, to keep figures and results honest over time'],
                ['The scrambled network address on visits, button presses and ad views', `${RETENTION.ipHashDays} days`, 'Blanked; the visits and presses themselves are kept'],
                ['The steps towards a plot (card opened, set up, price shown, paid or let go), with an account or a scrambled visitor number and network address', `${RETENTION.intentDays} days`, 'Deleted; the totals worked out from them are kept'],
                ['A plot held while you set it up', `${RETENTION.holdMinutes} minutes (up to 15 while you keep setting it up)`, 'Deleted'],
                ['Who was already counted passing a square of the map that day (scrambled)', `${RETENTION.trafficSeenDays} days`, 'Deleted; the daily counts per square (numbers only) are kept'],
                ['The plots you watch', 'Until you stop watching, or take the plot over', 'Deleted'],
                ['The weeks an owner used their dashboard, and pilot check-in answers', 'While the service runs', 'Kept with the business, to compare the pilot over time'],
                ["When a visitor number first came through someone's share link (the visitor number, the sharer's account and the time)", `${RETENTION.refFirstDays} days`, `Deleted. A link credits its sharer for ${RETENTION.referralDays} days from that first visit`],
                ['Staff sign-ins to the admin pages: the sign-in cookie, and the server\'s record of it (a hash, never the cookie itself)', `${RETENTION.adminSessionHours} hours at most (${RETENTION.adminIdleHours} without use)`, 'It stops working and the record is deleted'],
                ['Staff sign-in attempts, lockouts and sign-outs (the staff username if it is one, and a scrambled network address; never a password)', 'In the action log', 'The action log cannot be deleted'],
                ['A staff member\'s email for password resets', 'Until they remove or change it on their Account page', 'Deleted (the old address is told)'],
                ['Staff password reset and email confirmation links (only a hash, never the link)', `${RETENTION.adminLinkMinutes} minutes, one use; a newer link voids the older one`, 'Deleted within the hour after; the copy of the link in the sent email is removed from our outbox once it is sent'],
                ['Staff password reset requests and resets (the staff username if it is one, and a scrambled network address; never a link, token or password)', 'In the action log', 'The action log cannot be deleted'],
                ['Payments, refunds and the action log','[the period the law requires for accounting records]', 'The action log cannot be deleted'],
                ['Emails we sent', 'While the service runs', 'Kept'],
                ['Backups of the database', `${RETENTION.backupDays} days`, 'Deleted on our server'],
                ['What your browser keeps (see the privacy policy)', 'Until you clear it', `The referral code expires after ${RETENTION.referralDays} days`],
              ],
            ),
            review('Several things are kept with no end date (sent emails, visits and their scrambled addresses, the country list of arrivals, expired sign-in records). Decide limits and add clean-up jobs, or justify keeping them. Off-site backup copies uploaded with rclone are never deleted.'),
          ],
        },
      ],
    },
    // ---------------------------------------------------------------------------------------------------------------------------
    {
      slug: 'merchants',
      title: 'Merchant responsibilities',
      summary: 'What we expect of a business that lists on VoxelVenture: accurate pages, honoured offers, careful handling of customer details.',
      sections: [
        {
          id: 'page',
          heading: 'Your page and offers',
          blocks: [
            list(
              'Keep your business details, prices, offers and opening information accurate, and update them when they change.',
              'Honour every coupon and offer you publish until it ends or runs out, including at your till when a customer shows their coupon ticket.',
              'Only list a business you run or are allowed to represent.',
              'Your page, offers and ads must follow the terms of service and the advertising policy.',
            ),
          ],
        },
        {
          id: 'customers',
          heading: 'Customer details you receive',
          blocks: [
            'When a visitor sends you a meeting or quote request, or confirms a newsletter sign-up, we pass you their details. You then decide how they are used, and you are responsible for that use:',
            list(
              'use request details only to answer that request;',
              'email newsletter subscribers only about what they signed up for, and stop when they unsubscribe;',
              'keep the details secure, and do not sell or share them;',
              'follow the privacy laws that apply to you.',
            ),
            `Request details are wiped from VoxelVenture after ${RETENTION.inquiryDays} days; copy what you need to keep before then.`,
            review('Decide whether merchants need a data processing agreement or just these terms where you operate.'),
          ],
        },
        {
          id: 'figures',
          heading: 'Honest figures',
          blocks: [
            list(
              'Report only real sales to the conversion address, with the right value and order number.',
              'Keep your conversion key on your server, never in a web page or a link. If it leaks, make a new one in your dashboard: the old one stops working at once.',
              'Do not try to inflate your figures (fake visits, presses, sign-ups or votes). Your own visits and robots are already left out.',
            ),
            'Sales reported by the pixel on your thank-you page are shown as browser-reported, because they cannot be verified.',
          ],
        },
        {
          id: 'social',
          heading: 'Welcome posts',
          blocks: [`If you tick the box, we may post a welcome to your business on our X account, tagging your handle (at most ${LIMITS.socialPostsPerDay} welcome posts a day across VoxelVenture). Un-ticking it stops future posts; a post already made stays unless you ask us to remove it.`],
        },
        {
          id: 'enforcement',
          heading: 'If something goes wrong',
          blocks: ['We may remove a page, offer or ad, end a placement, or close an account that breaks these responsibilities. The refund policy says what happens to anything you paid for.'],
        },
      ],
    },
  ];
}

export const policyBySlug = (slug, o) => policies(o).find((p) => p.slug === slug) ?? null;
