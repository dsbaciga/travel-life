import { LanguageWithPhrases } from '../types/languagePhrase.types';

/**
 * Additional language phrases - Icelandic.
 *
 * Latin-script languages carry no `pronunciation`. Where Icelandic marks the
 * speaker's gender the neutral or plural form is used, or both are shown.
 */

export const LANGUAGE_PHRASES_ADDITIONAL: LanguageWithPhrases[] = [
  // ==========================================================================
  // ICELANDIC
  // ==========================================================================
  {
    code: 'is',
    name: 'Icelandic',
    nativeName: 'Íslenska',
    phrases: [
      // Greetings
      { id: 'is-g1', english: 'Hello', translation: 'Halló', category: 'greetings' },
      { id: 'is-g2', english: 'Good morning', translation: 'Góðan daginn', category: 'greetings' },
      { id: 'is-g3', english: 'Good evening', translation: 'Gott kvöld', category: 'greetings' },
      { id: 'is-g4', english: 'Goodbye', translation: 'Bless', category: 'greetings' },
      { id: 'is-g5', english: 'How are you?', translation: 'Hvernig hefurðu það?', category: 'greetings' },
      { id: 'is-g6', english: 'Nice to meet you', translation: 'Gaman að kynnast þér', category: 'greetings' },
      { id: 'is-g7', english: 'My name is...', translation: 'Ég heiti...', category: 'greetings' },
      { id: 'is-g8', english: 'See you later', translation: 'Sjáumst síðar', category: 'greetings' },
      { id: 'is-g9', english: 'Good night', translation: 'Góða nótt', category: 'greetings' },
      { id: 'is-g10', english: 'Welcome', translation: 'Verið velkomin', category: 'greetings' },
      // Dining
      { id: 'is-d1', english: 'A table for two, please', translation: 'Borð fyrir tvo, takk', category: 'dining' },
      { id: 'is-d2', english: 'The menu, please', translation: 'Matseðilinn, takk', category: 'dining' },
      { id: 'is-d3', english: 'I would like...', translation: 'Ég ætla að fá...', category: 'dining' },
      { id: 'is-d4', english: 'The bill, please', translation: 'Reikninginn, takk', category: 'dining' },
      { id: 'is-d5', english: 'Delicious!', translation: 'Ljúffengt!', category: 'dining' },
      { id: 'is-d6', english: 'Water, please', translation: 'Vatn, takk', category: 'dining' },
      { id: 'is-d7', english: 'I am vegetarian', translation: 'Ég er grænmetisæta', category: 'dining' },
      { id: 'is-d8', english: 'No meat, please', translation: 'Ekkert kjöt, takk', category: 'dining' },
      { id: 'is-d9', english: 'Is this spicy?', translation: 'Er þetta sterkt?', category: 'dining' },
      { id: 'is-d10', english: 'Cheers!', translation: 'Skál!', category: 'dining' },
      // Directions
      { id: 'is-dir1', english: 'Where is...?', translation: 'Hvar er...?', category: 'directions' },
      { id: 'is-dir2', english: 'Turn left', translation: 'Beygðu til vinstri', category: 'directions' },
      { id: 'is-dir3', english: 'Turn right', translation: 'Beygðu til hægri', category: 'directions' },
      { id: 'is-dir4', english: 'Go straight', translation: 'Farðu beint áfram', category: 'directions' },
      { id: 'is-dir5', english: 'How far is it?', translation: 'Hversu langt er það?', category: 'directions' },
      { id: 'is-dir6', english: 'Train station', translation: 'Lestarstöðin', category: 'directions' },
      { id: 'is-dir7', english: 'Bus stop', translation: 'Strætóstoppistöðin', category: 'directions' },
      { id: 'is-dir8', english: 'Airport', translation: 'Flugvöllurinn', category: 'directions' },
      { id: 'is-dir9', english: 'Hotel', translation: 'Hótelið', category: 'directions' },
      { id: 'is-dir10', english: 'Taxi', translation: 'Leigubíll', category: 'directions' },
      // Emergency
      { id: 'is-e1', english: 'Help!', translation: 'Hjálp!', category: 'emergency' },
      { id: 'is-e2', english: 'Call the police', translation: 'Hringdu á lögregluna', category: 'emergency' },
      { id: 'is-e3', english: 'I need a doctor', translation: 'Mig vantar lækni', category: 'emergency' },
      { id: 'is-e4', english: 'Hospital', translation: 'Sjúkrahúsið', category: 'emergency' },
      { id: 'is-e5', english: 'I am lost', translation: 'Ég er villt(ur)', category: 'emergency' },
      { id: 'is-e6', english: 'Emergency', translation: 'Neyðartilvik', category: 'emergency' },
      { id: 'is-e7', english: 'Fire!', translation: 'Eldur!', category: 'emergency' },
      { id: 'is-e8', english: 'I need help', translation: 'Ég þarf hjálp', category: 'emergency' },
      { id: 'is-e9', english: 'Call an ambulance', translation: 'Hringdu á sjúkrabíl', category: 'emergency' },
      { id: 'is-e10', english: 'Pharmacy', translation: 'Apótek', category: 'emergency' },
      // Shopping
      { id: 'is-s1', english: 'How much is this?', translation: 'Hvað kostar þetta?', category: 'shopping' },
      { id: 'is-s2', english: 'Too expensive', translation: 'Of dýrt', category: 'shopping' },
      { id: 'is-s3', english: 'Can I pay by card?', translation: 'Get ég borgað með korti?', category: 'shopping' },
      { id: 'is-s4', english: 'I am just looking', translation: 'Ég er bara að skoða', category: 'shopping' },
      { id: 'is-s5', english: 'Do you have...?', translation: 'Eigið þið til...?', category: 'shopping' },
      { id: 'is-s6', english: 'Receipt, please', translation: 'Kvittun, takk', category: 'shopping' },
      { id: 'is-s7', english: 'Discount', translation: 'Afsláttur', category: 'shopping' },
      { id: 'is-s8', english: 'Cash', translation: 'Reiðufé', category: 'shopping' },
      { id: 'is-s9', english: 'Credit card', translation: 'Kreditkort', category: 'shopping' },
      { id: 'is-s10', english: 'Size', translation: 'Stærð', category: 'shopping' },
      // Courtesy
      { id: 'is-c1', english: 'Thank you', translation: 'Takk fyrir', category: 'courtesy' },
      { id: 'is-c2', english: 'Please', translation: 'Vinsamlegast', category: 'courtesy' },
      { id: 'is-c3', english: 'Excuse me', translation: 'Afsakið', category: 'courtesy' },
      { id: 'is-c4', english: 'Sorry', translation: 'Fyrirgefðu', category: 'courtesy' },
      { id: 'is-c5', english: 'Yes', translation: 'Já', category: 'courtesy' },
      { id: 'is-c6', english: 'No', translation: 'Nei', category: 'courtesy' },
      { id: 'is-c7', english: 'I do not understand', translation: 'Ég skil ekki', category: 'courtesy' },
      { id: 'is-c8', english: 'Do you speak English?', translation: 'Talarðu ensku?', category: 'courtesy' },
      { id: 'is-c9', english: 'Please speak slowly', translation: 'Talaðu hægt, takk', category: 'courtesy' },
      { id: 'is-c10', english: 'You are welcome', translation: 'Ekkert að þakka', category: 'courtesy' },
    ],
  },
];
