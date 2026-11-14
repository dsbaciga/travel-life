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
      { id: 'is-g1', english: 'Hello', translation: 'Halló', pronunciation: 'HAH-loh', category: 'greetings' },
      { id: 'is-g2', english: 'Good morning', translation: 'Góðan daginn', pronunciation: 'GOH-dhahn DY-in', category: 'greetings' },
      { id: 'is-g3', english: 'Good evening', translation: 'Gott kvöld', pronunciation: 'goht KVULT', category: 'greetings' },
      { id: 'is-g4', english: 'Goodbye', translation: 'Bless', pronunciation: 'BLESS', category: 'greetings' },
      { id: 'is-g5', english: 'How are you?', translation: 'Hvernig hefurðu það?', pronunciation: 'KVER-nik HEH-vur-dhoo thahdh', category: 'greetings' },
      { id: 'is-g6', english: 'Nice to meet you', translation: 'Gaman að kynnast þér', pronunciation: 'GAH-mahn ahdh KIN-nahst thyehr', category: 'greetings' },
      { id: 'is-g7', english: 'My name is...', translation: 'Ég heiti...', pronunciation: 'yeh HAY-tee', category: 'greetings' },
      { id: 'is-g8', english: 'See you later', translation: 'Sjáumst síðar', pronunciation: 'SYOW-oomst SEE-dhar', category: 'greetings' },
      { id: 'is-g9', english: 'Good night', translation: 'Góða nótt', pronunciation: 'GOH-dha NOHT', category: 'greetings' },
      { id: 'is-g10', english: 'Welcome', translation: 'Verið velkomin', pronunciation: 'VEH-ridh VEL-koh-min', category: 'greetings' },
      // Dining
      { id: 'is-d1', english: 'A table for two, please', translation: 'Borð fyrir tvo, takk', pronunciation: 'bordh FIH-rir tvoh, tahk', category: 'dining' },
      { id: 'is-d2', english: 'The menu, please', translation: 'Matseðilinn, takk', pronunciation: 'MAHT-seh-dhi-lin, tahk', category: 'dining' },
      { id: 'is-d3', english: 'I would like...', translation: 'Ég ætla að fá...', pronunciation: 'yeh EYE-tla ahdh FOW', category: 'dining' },
      { id: 'is-d4', english: 'The bill, please', translation: 'Reikninginn, takk', pronunciation: 'RAYK-nin-gin, tahk', category: 'dining' },
      { id: 'is-d5', english: 'Delicious!', translation: 'Ljúffengt!', pronunciation: 'LYOOF-fenkt', category: 'dining' },
      { id: 'is-d6', english: 'Water, please', translation: 'Vatn, takk', pronunciation: 'VAHTN, tahk', category: 'dining' },
      { id: 'is-d7', english: 'I am vegetarian', translation: 'Ég er grænmetisæta', pronunciation: 'yeh er GRYN-meh-tis-eye-tah', category: 'dining' },
      { id: 'is-d8', english: 'No meat, please', translation: 'Ekkert kjöt, takk', pronunciation: 'EH-kert KYURT, tahk', category: 'dining' },
      { id: 'is-d9', english: 'Is this spicy?', translation: 'Er þetta sterkt?', pronunciation: 'er THEH-tah STERKT', category: 'dining' },
      { id: 'is-d10', english: 'Cheers!', translation: 'Skál!', pronunciation: 'SKOWL', category: 'dining' },
      // Directions
      { id: 'is-dir1', english: 'Where is...?', translation: 'Hvar er...?', pronunciation: 'KVAHR er', category: 'directions' },
      { id: 'is-dir2', english: 'Turn left', translation: 'Beygðu til vinstri', pronunciation: 'BAYG-dhu til VIN-stri', category: 'directions' },
      { id: 'is-dir3', english: 'Turn right', translation: 'Beygðu til hægri', pronunciation: 'BAYG-dhu til HY-ri', category: 'directions' },
      { id: 'is-dir4', english: 'Go straight', translation: 'Farðu beint áfram', pronunciation: 'FAR-dhu baynt OW-frahm', category: 'directions' },
      { id: 'is-dir5', english: 'How far is it?', translation: 'Hversu langt er það?', pronunciation: 'KVER-su lowngt er thahdh', category: 'directions' },
      { id: 'is-dir6', english: 'Train station', translation: 'Lestarstöðin', pronunciation: 'LES-tar-stur-dhin', category: 'directions' },
      { id: 'is-dir7', english: 'Bus stop', translation: 'Strætóstoppistöðin', pronunciation: 'STRY-toh-stop-pi-stur-dhin', category: 'directions' },
      { id: 'is-dir8', english: 'Airport', translation: 'Flugvöllurinn', pronunciation: 'FLUG-vurt-lu-rin', category: 'directions' },
      { id: 'is-dir9', english: 'Hotel', translation: 'Hótelið', pronunciation: 'HOH-teh-lidh', category: 'directions' },
      { id: 'is-dir10', english: 'Taxi', translation: 'Leigubíll', pronunciation: 'LAY-gu-beetl', category: 'directions' },
      // Emergency
      { id: 'is-e1', english: 'Help!', translation: 'Hjálp!', pronunciation: 'HYOWLP', category: 'emergency' },
      { id: 'is-e2', english: 'Call the police', translation: 'Hringdu á lögregluna', pronunciation: 'HRING-du ow LUR-grek-lu-na', category: 'emergency' },
      { id: 'is-e3', english: 'I need a doctor', translation: 'Mig vantar lækni', pronunciation: 'mikh VAHN-tar LYK-ni', category: 'emergency' },
      { id: 'is-e4', english: 'Hospital', translation: 'Sjúkrahúsið', pronunciation: 'SYOO-krah-hoo-sidh', category: 'emergency' },
      { id: 'is-e5', english: 'I am lost', translation: 'Ég er villt(ur)', pronunciation: 'yeh er VILT (-ur)', category: 'emergency' },
      { id: 'is-e6', english: 'Emergency', translation: 'Neyðartilvik', pronunciation: 'NAY-dhar-til-vik', category: 'emergency' },
      { id: 'is-e7', english: 'Fire!', translation: 'Eldur!', pronunciation: 'EL-dur', category: 'emergency' },
      { id: 'is-e8', english: 'I need help', translation: 'Ég þarf hjálp', pronunciation: 'yeh THARF hyowlp', category: 'emergency' },
      { id: 'is-e9', english: 'Call an ambulance', translation: 'Hringdu á sjúkrabíl', pronunciation: 'HRING-du ow SYOO-krah-beel', category: 'emergency' },
      { id: 'is-e10', english: 'Pharmacy', translation: 'Apótek', pronunciation: 'AH-poh-tek', category: 'emergency' },
      // Shopping
      { id: 'is-s1', english: 'How much is this?', translation: 'Hvað kostar þetta?', pronunciation: 'KVAHDH KOS-tar THEH-tah', category: 'shopping' },
      { id: 'is-s2', english: 'Too expensive', translation: 'Of dýrt', pronunciation: 'of DEERT', category: 'shopping' },
      { id: 'is-s3', english: 'Can I pay by card?', translation: 'Get ég borgað með korti?', pronunciation: 'get yeh BOR-gahdh medh KOR-ti', category: 'shopping' },
      { id: 'is-s4', english: 'I am just looking', translation: 'Ég er bara að skoða', pronunciation: 'yeh er BAH-ra ahdh SKOH-dha', category: 'shopping' },
      { id: 'is-s5', english: 'Do you have...?', translation: 'Eigið þið til...?', pronunciation: 'AY-idh thidh TIL', category: 'shopping' },
      { id: 'is-s6', english: 'Receipt, please', translation: 'Kvittun, takk', pronunciation: 'KVIT-tun, tahk', category: 'shopping' },
      { id: 'is-s7', english: 'Discount', translation: 'Afsláttur', pronunciation: 'AHF-slow-tur', category: 'shopping' },
      { id: 'is-s8', english: 'Cash', translation: 'Reiðufé', pronunciation: 'RAY-dhu-fyeh', category: 'shopping' },
      { id: 'is-s9', english: 'Credit card', translation: 'Kreditkort', pronunciation: 'KREH-dit-kort', category: 'shopping' },
      { id: 'is-s10', english: 'Size', translation: 'Stærð', pronunciation: 'STYRDH', category: 'shopping' },
      // Courtesy
      { id: 'is-c1', english: 'Thank you', translation: 'Takk fyrir', pronunciation: 'tahk FIH-rir', category: 'courtesy' },
      { id: 'is-c2', english: 'Please', translation: 'Vinsamlegast', pronunciation: 'VIN-sam-leh-gahst', category: 'courtesy' },
      { id: 'is-c3', english: 'Excuse me', translation: 'Afsakið', pronunciation: 'AHF-sa-kidh', category: 'courtesy' },
      { id: 'is-c4', english: 'Sorry', translation: 'Fyrirgefðu', pronunciation: 'FIH-rir-gev-dhu', category: 'courtesy' },
      { id: 'is-c5', english: 'Yes', translation: 'Já', pronunciation: 'YOW', category: 'courtesy' },
      { id: 'is-c6', english: 'No', translation: 'Nei', pronunciation: 'NAY', category: 'courtesy' },
      { id: 'is-c7', english: 'I do not understand', translation: 'Ég skil ekki', pronunciation: 'yeh skil EH-chi', category: 'courtesy' },
      { id: 'is-c8', english: 'Do you speak English?', translation: 'Talarðu ensku?', pronunciation: 'TAH-lar-dhu EN-sku', category: 'courtesy' },
      { id: 'is-c9', english: 'Please speak slowly', translation: 'Talaðu hægt, takk', pronunciation: 'TAH-la-dhu HYKHT, tahk', category: 'courtesy' },
      { id: 'is-c10', english: 'You are welcome', translation: 'Ekkert að þakka', pronunciation: 'EH-kert ahdh THAH-ka', category: 'courtesy' },
    ],
  },
];
