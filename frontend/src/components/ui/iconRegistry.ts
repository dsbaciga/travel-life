/**
 * Icon registry: semantic icon name -> Material Symbols glyph (see Icon.tsx).
 *
 * Every icon is a Material Symbols (outlined, weight 400) glyph, the same
 * family the Android app uses (`mobile/src/components/iconGlyphs.ts`). Callers
 * pass a meaning (`name="flight"`, `name="stay"`), never a glyph, so one meaning
 * looks the same everywhere and can be restyled in one place.
 *
 * Glyphs are bundled at build time by `unplugin-icons` (no runtime fetching), so
 * they work offline in the PWA. Do not use emoji, `@heroicons/react` or
 * hand-written `<svg>` icons for UI chrome; add a name here instead.
 *
 * Names shared with mobile (today, map, trip, vault, add, place, pin, transit,
 * checkIn, checkOut, camera, photos, receipt, food, meal, note, link, parking,
 * phrasebook, navigate, myLocation, search, settings, copy, checked, unchecked,
 * plug, water, money, delete, sync, offline, alert, chevronRight, chevronLeft,
 * expand, collapse, fitAll, close, schedule, calendar) keep the same meaning.
 */
import MiSailingOutline from '~icons/material-symbols/sailing-outline';
import MiTwoWheelerOutline from '~icons/material-symbols/two-wheeler-outline';
import MiLocalTaxiOutline from '~icons/material-symbols/local-taxi-outline';
import MiSubwayOutline from '~icons/material-symbols/subway-outline';
import MiTramOutline from '~icons/material-symbols/tram-outline';
import MiAccountBalanceOutline from '~icons/material-symbols/account-balance-outline';
import MiAccountBalanceWalletOutline from '~icons/material-symbols/account-balance-wallet-outline';
import MiAdd from '~icons/material-symbols/add';
import MiAir from '~icons/material-symbols/air';
import MiAirportShuttleOutline from '~icons/material-symbols/airport-shuttle-outline';
import MiAlarm from '~icons/material-symbols/alarm';
import MiApartment from '~icons/material-symbols/apartment';
import MiArrowBack from '~icons/material-symbols/arrow-back';
import MiArrowDownward from '~icons/material-symbols/arrow-downward';
import MiArrowForward from '~icons/material-symbols/arrow-forward';
import MiArrowUpward from '~icons/material-symbols/arrow-upward';
import MiAutoAwesome from '~icons/material-symbols/auto-awesome';
import MiBadgeOutline from '~icons/material-symbols/badge-outline';
import MiBeachAccessOutline from '~icons/material-symbols/beach-access-outline';
import MiBedOutline from '~icons/material-symbols/bed-outline';
import MiBedtimeOutline from '~icons/material-symbols/bedtime-outline';
import MiBlock from '~icons/material-symbols/block';
import MiBolt from '~icons/material-symbols/bolt';
import MiBusinessCenterOutline from '~icons/material-symbols/business-center-outline';
import MiCalendarTodayOutline from '~icons/material-symbols/calendar-today-outline';
import MiCallOutline from '~icons/material-symbols/call-outline';
import MiCampingOutline from '~icons/material-symbols/camping-outline';
import MiCancelOutline from '~icons/material-symbols/cancel-outline';
import MiCheck from '~icons/material-symbols/check';
import MiCheckBox from '~icons/material-symbols/check-box';
import MiCheckBoxOutlineBlank from '~icons/material-symbols/check-box-outline-blank';
import MiCheckCircleOutline from '~icons/material-symbols/check-circle-outline';
import MiChecklistOutline from '~icons/material-symbols/checklist-outline';
import MiChevronLeft from '~icons/material-symbols/chevron-left';
import MiChevronRight from '~icons/material-symbols/chevron-right';
import MiClose from '~icons/material-symbols/close';
import MiCloudDoneOutline from '~icons/material-symbols/cloud-done-outline';
import MiCloudOffOutline from '~icons/material-symbols/cloud-off-outline';
import MiCloudOutline from '~icons/material-symbols/cloud-outline';
import MiCloudUploadOutline from '~icons/material-symbols/cloud-upload-outline';
import MiCommuteOutline from '~icons/material-symbols/commute-outline';
import MiConfirmationNumberOutline from '~icons/material-symbols/confirmation-number-outline';
import MiConnectingAirportsOutline from '~icons/material-symbols/connecting-airports-outline';
import MiContentCopyOutline from '~icons/material-symbols/content-copy-outline';
import MiCottageOutline from '~icons/material-symbols/cottage-outline';
import MiDashboardOutline from '~icons/material-symbols/dashboard-outline';
import MiDatabaseOutline from '~icons/material-symbols/database-outline';
import MiDeleteOutline from '~icons/material-symbols/delete-outline';
import MiDescriptionOutline from '~icons/material-symbols/description-outline';
import MiDesktopWindowsOutline from '~icons/material-symbols/desktop-windows-outline';
import MiDeviceThermostat from '~icons/material-symbols/device-thermostat';
import MiDirectionsBike from '~icons/material-symbols/directions-bike';
import MiDirectionsBoatOutline from '~icons/material-symbols/directions-boat-outline';
import MiDirectionsBusOutline from '~icons/material-symbols/directions-bus-outline';
import MiDirectionsCarOutline from '~icons/material-symbols/directions-car-outline';
import MiDirectionsOutline from '~icons/material-symbols/directions-outline';
import MiDirectionsWalk from '~icons/material-symbols/directions-walk';
import MiDownload from '~icons/material-symbols/download';
import MiEcoOutline from '~icons/material-symbols/eco-outline';
import MiEditNote from '~icons/material-symbols/edit-note';
import MiEditOutline from '~icons/material-symbols/edit-outline';
import MiEggAltOutline from '~icons/material-symbols/egg-alt-outline';
import MiEmergencyOutline from '~icons/material-symbols/emergency-outline';
import MiErrorOutline from '~icons/material-symbols/error-outline';
import MiEventOutline from '~icons/material-symbols/event-outline';
import MiExpandLess from '~icons/material-symbols/expand-less';
import MiExpandMore from '~icons/material-symbols/expand-more';
import MiExploreOutline from '~icons/material-symbols/explore-outline';
import MiFilterList from '~icons/material-symbols/filter-list';
import MiFitScreenOutline from '~icons/material-symbols/fit-screen-outline';
import MiFlagOutline from '~icons/material-symbols/flag-outline';
import MiFlightLand from '~icons/material-symbols/flight-land';
import MiFlightOutline from '~icons/material-symbols/flight-outline';
import MiFoggyOutline from '~icons/material-symbols/foggy-outline';
import MiFolderOutline from '~icons/material-symbols/folder-outline';
import MiGrain from '~icons/material-symbols/grain';
import MiGrass from '~icons/material-symbols/grass';
import MiGridView from '~icons/material-symbols/grid-view';
import MiGroupOutline from '~icons/material-symbols/group-outline';
import MiHiking from '~icons/material-symbols/hiking';
import MiHistory from '~icons/material-symbols/history';
import MiHomeOutline from '~icons/material-symbols/home-outline';
import MiHotelOutline from '~icons/material-symbols/hotel-outline';
import MiHourglassEmpty from '~icons/material-symbols/hourglass-empty';
import MiHouseOutline from '~icons/material-symbols/house-outline';
import MiHumidityPercentageOutline from '~icons/material-symbols/humidity-percentage-outline';
import MiIdCardOutline from '~icons/material-symbols/id-card-outline';
import MiImageOutline from '~icons/material-symbols/image-outline';
import MiInfoOutline from '~icons/material-symbols/info-outline';
import MiInstallMobile from '~icons/material-symbols/install-mobile';
import MiKeyOutline from '~icons/material-symbols/key-outline';
import MiKeyboardDoubleArrowLeft from '~icons/material-symbols/keyboard-double-arrow-left';
import MiLabelOutline from '~icons/material-symbols/label-outline';
import MiLanguage from '~icons/material-symbols/language';
import MiLibraryBooksOutline from '~icons/material-symbols/library-books-outline';
import MiLightbulbOutline from '~icons/material-symbols/lightbulb-outline';
import MiLink from '~icons/material-symbols/link';
import MiLinkOff from '~icons/material-symbols/link-off';
import MiList from '~icons/material-symbols/list';
import MiLocalActivityOutline from '~icons/material-symbols/local-activity-outline';
import MiLocalBarOutline from '~icons/material-symbols/local-bar-outline';
import MiLocalCafeOutline from '~icons/material-symbols/local-cafe-outline';
import MiLocalDrinkOutline from '~icons/material-symbols/local-drink-outline';
import MiLocalFireDepartmentOutline from '~icons/material-symbols/local-fire-department-outline';
import MiLocalPoliceOutline from '~icons/material-symbols/local-police-outline';
import MiLocationCity from '~icons/material-symbols/location-city';
import MiLocationOnOutline from '~icons/material-symbols/location-on-outline';
import MiLuggageOutline from '~icons/material-symbols/luggage-outline';
import MiMailOutline from '~icons/material-symbols/mail-outline';
import MiMapOutline from '~icons/material-symbols/map-outline';
import MiMedicalServicesOutline from '~icons/material-symbols/medical-services-outline';
import MiMenu from '~icons/material-symbols/menu';
import MiMenuBookOutline from '~icons/material-symbols/menu-book-outline';
import MiMoreHoriz from '~icons/material-symbols/more-horiz';
import MiMoreVert from '~icons/material-symbols/more-vert';
import MiMosqueOutline from '~icons/material-symbols/mosque-outline';
import MiMuseumOutline from '~icons/material-symbols/museum-outline';
import MiMyLocation from '~icons/material-symbols/my-location';
import MiNavigationOutline from '~icons/material-symbols/navigation-outline';
import MiNoFoodOutline from '~icons/material-symbols/no-food-outline';
import MiNotificationsOutline from '~icons/material-symbols/notifications-outline';
import MiNutritionOutline from '~icons/material-symbols/nutrition-outline';
import MiOpenInNew from '~icons/material-symbols/open-in-new';
import MiParkOutline from '~icons/material-symbols/park-outline';
import MiPartlyCloudyDayOutline from '~icons/material-symbols/partly-cloudy-day-outline';
import MiPassportOutline from '~icons/material-symbols/passport-outline';
import MiPaymentsOutline from '~icons/material-symbols/payments-outline';
import MiPersonAddOutline from '~icons/material-symbols/person-add-outline';
import MiPersonOutline from '~icons/material-symbols/person-outline';
import MiPhotoAlbumOutline from '~icons/material-symbols/photo-album-outline';
import MiPhotoCameraOutline from '~icons/material-symbols/photo-camera-outline';
import MiPhotoLibraryOutline from '~icons/material-symbols/photo-library-outline';
import MiPictureAsPdfOutline from '~icons/material-symbols/picture-as-pdf-outline';
import MiPinDropOutline from '~icons/material-symbols/pin-drop-outline';
import MiPlayArrow from '~icons/material-symbols/play-arrow';
import MiPower from '~icons/material-symbols/power';
import MiPrintOutline from '~icons/material-symbols/print-outline';
import MiProgressActivity from '~icons/material-symbols/progress-activity';
import MiPublic from '~icons/material-symbols/public';
import MiPushPinOutline from '~icons/material-symbols/push-pin-outline';
import MiRainyOutline from '~icons/material-symbols/rainy-outline';
import MiRamenDiningOutline from '~icons/material-symbols/ramen-dining-outline';
import MiReceiptLongOutline from '~icons/material-symbols/receipt-long-outline';
import MiRefresh from '~icons/material-symbols/refresh';
import MiRestaurant from '~icons/material-symbols/restaurant';
import MiRocketLaunchOutline from '~icons/material-symbols/rocket-launch-outline';
import MiRoute from '~icons/material-symbols/route';
import MiScheduleOutline from '~icons/material-symbols/schedule-outline';
import MiSearch from '~icons/material-symbols/search';
import MiSellOutline from '~icons/material-symbols/sell-outline';
import MiSetMealOutline from '~icons/material-symbols/set-meal-outline';
import MiSettingsOutline from '~icons/material-symbols/settings-outline';
import MiShareOutline from '~icons/material-symbols/share-outline';
import MiShieldLockOutline from '~icons/material-symbols/shield-lock-outline';
import MiShoppingBagOutline from '~icons/material-symbols/shopping-bag-outline';
import MiShoppingCartOutline from '~icons/material-symbols/shopping-cart-outline';
import MiSmartphone from '~icons/material-symbols/smartphone';
import MiSos from '~icons/material-symbols/sos';
import MiSpaOutline from '~icons/material-symbols/spa-outline';
import MiSportsOutline from '~icons/material-symbols/sports-outline';
import MiStar from '~icons/material-symbols/star';
import MiStarOutline from '~icons/material-symbols/star-outline';
import MiSynagogueOutline from '~icons/material-symbols/synagogue-outline';
import MiSync from '~icons/material-symbols/sync';
import MiTarget from '~icons/material-symbols/target';
import MiTheaterComedyOutline from '~icons/material-symbols/theater-comedy-outline';
import MiThunderstormOutline from '~icons/material-symbols/thunderstorm-outline';
import MiTrainOutline from '~icons/material-symbols/train-outline';
import MiTranslate from '~icons/material-symbols/translate';
import MiTrendingDown from '~icons/material-symbols/trending-down';
import MiUndo from '~icons/material-symbols/undo';
import MiUpload from '~icons/material-symbols/upload';
import MiVaccinesOutline from '~icons/material-symbols/vaccines-outline';
import MiVerifiedUserOutline from '~icons/material-symbols/verified-user-outline';
import MiVideocamOutline from '~icons/material-symbols/videocam-outline';
import MiVillaOutline from '~icons/material-symbols/villa-outline';
import MiVisibilityOffOutline from '~icons/material-symbols/visibility-off-outline';
import MiVisibilityOutline from '~icons/material-symbols/visibility-outline';
import MiVolunteerActivismOutline from '~icons/material-symbols/volunteer-activism-outline';
import MiWarningOutline from '~icons/material-symbols/warning-outline';
import MiWaterDropOutline from '~icons/material-symbols/water-drop-outline';
import MiWavingHandOutline from '~icons/material-symbols/waving-hand-outline';
import MiWbSunnyOutline from '~icons/material-symbols/wb-sunny-outline';
import MiWeatherSnowyOutline from '~icons/material-symbols/weather-snowy-outline';
import MiWifi from '~icons/material-symbols/wifi';
import MiZoomIn from '~icons/material-symbols/zoom-in';
import MiZoomOut from '~icons/material-symbols/zoom-out';

/**
 * The icon registry: semantic name -> Material Symbols (outlined) glyph.
 */
export const ICONS = {
  // Actions
  add: MiAdd,
  close: MiClose,
  check: MiCheck,
  edit: MiEditOutline,
  delete: MiDeleteOutline,
  copy: MiContentCopyOutline,
  search: MiSearch,
  settings: MiSettingsOutline,
  link: MiLink,
  unlink: MiLinkOff,
  download: MiDownload,
  upload: MiUpload,
  share: MiShareOutline,
  more: MiMoreHoriz,
  moreVertical: MiMoreVert,
  menu: MiMenu,
  filter: MiFilterList,
  refresh: MiRefresh,
  sync: MiSync,
  zoomIn: MiZoomIn,
  zoomOut: MiZoomOut,
  fitAll: MiFitScreenOutline,
  visible: MiVisibilityOutline,
  hidden: MiVisibilityOffOutline,
  vault: MiShieldLockOutline,
  shieldCheck: MiVerifiedUserOutline,
  key: MiKeyOutline,
  externalLink: MiOpenInNew,
  history: MiHistory,
  undo: MiUndo,
  play: MiPlayArrow,
  print: MiPrintOutline,
  spinner: MiProgressActivity,
  // Direction
  back: MiArrowBack,
  forward: MiArrowForward,
  arrowUp: MiArrowUpward,
  arrowDown: MiArrowDownward,
  chevronRight: MiChevronRight,
  chevronLeft: MiChevronLeft,
  expand: MiExpandMore,
  collapse: MiExpandLess,
  doubleChevronLeft: MiKeyboardDoubleArrowLeft,
  trendDown: MiTrendingDown,
  // Status and feedback
  info: MiInfoOutline,
  alert: MiWarningOutline,
  error: MiErrorOutline,
  success: MiCheckCircleOutline,
  cancel: MiCancelOutline,
  pending: MiHourglassEmpty,
  bolt: MiBolt,
  sparkle: MiAutoAwesome,
  lightbulb: MiLightbulbOutline,
  notification: MiNotificationsOutline,
  flag: MiFlagOutline,
  star: MiStarOutline,
  starFilled: MiStar,
  tag: MiSellOutline,
  label: MiLabelOutline,
  folder: MiFolderOutline,
  pin: MiPushPinOutline,
  checked: MiCheckBox,
  unchecked: MiCheckBoxOutlineBlank,
  online: MiWifi,
  offline: MiCloudOffOutline,
  cloud: MiCloudOutline,
  cloudUpload: MiCloudUploadOutline,
  cloudDone: MiCloudDoneOutline,
  storage: MiDatabaseOutline,
  target: MiTarget,
  block: MiBlock,
  // Time
  schedule: MiScheduleOutline,
  calendar: MiCalendarTodayOutline,
  event: MiEventOutline,
  today: MiWbSunnyOutline,
  alarm: MiAlarm,
  timezone: MiPublic,
  flightLand: MiFlightLand,
  // Maps and navigation
  map: MiMapOutline,
  place: MiLocationOnOutline,
  myLocation: MiMyLocation,
  navigate: MiNavigationOutline,
  directions: MiDirectionsOutline,
  route: MiRoute,
  explore: MiExploreOutline,
  trip: MiExploreOutline,
  globe: MiPublic,
  language: MiLanguage,
  phrasebook: MiTranslate,
  mapPin: MiPinDropOutline,
  // Entities
  activity: MiLocalActivityOutline,
  transportation: MiCommuteOutline,
  lodging: MiHotelOutline,
  stay: MiHotelOutline,
  location: MiLocationOnOutline,
  journal: MiMenuBookOutline,
  expense: MiPaymentsOutline,
  photo: MiImageOutline,
  photos: MiPhotoLibraryOutline,
  album: MiPhotoAlbumOutline,
  document: MiDescriptionOutline,
  checklist: MiChecklistOutline,
  custom: MiPushPinOutline,
  savedLink: MiLink,
  pdf: MiPictureAsPdfOutline,
  series: MiLibraryBooksOutline,
  souvenir: MiShoppingBagOutline,
  foodLog: MiRestaurant,
  budget: MiAccountBalanceWalletOutline,
  passport: MiPassportOutline,
  visa: MiBadgeOutline,
  idCard: MiIdCardOutline,
  ticket: MiConfirmationNumberOutline,
  luggage: MiLuggageOutline,
  checkIn: MiHotelOutline,
  checkOut: MiLuggageOutline,
  note: MiEditNote,
  receipt: MiReceiptLongOutline,
  money: MiPaymentsOutline,
  wallet: MiAccountBalanceWalletOutline,
  camera: MiPhotoCameraOutline,
  video: MiVideocamOutline,
  food: MiRestaurant,
  meal: MiRamenDiningOutline,
  plug: MiPower,
  water: MiWaterDropOutline,
  tripType: MiExploreOutline,
  dashboard: MiDashboardOutline,
  home: MiHomeOutline,
  list: MiList,
  grid: MiGridView,
  computer: MiDesktopWindowsOutline,
  smartphone: MiSmartphone,
  install: MiInstallMobile,
  mail: MiMailOutline,
  phone: MiCallOutline,
  wifi: MiWifi,
  user: MiPersonOutline,
  users: MiGroupOutline,
  personAdd: MiPersonAddOutline,
  company: MiBusinessCenterOutline,
  // Transport modes
  flight: MiFlightOutline,
  train: MiTrainOutline,
  transit: MiTrainOutline,
  bus: MiDirectionsBusOutline,
  car: MiDirectionsCarOutline,
  parking: MiDirectionsCarOutline,
  ferry: MiDirectionsBoatOutline,
  bike: MiDirectionsBike,
  boat: MiSailingOutline,
  motorcycle: MiTwoWheelerOutline,
  taxi: MiLocalTaxiOutline,
  subway: MiSubwayOutline,
  tram: MiTramOutline,
  walk: MiDirectionsWalk,
  van: MiAirportShuttleOutline,
  rocket: MiRocketLaunchOutline,
  // Lodging and places
  hotel: MiHotelOutline,
  hostel: MiBedOutline,
  apartment: MiApartment,
  house: MiHouseOutline,
  cottage: MiCottageOutline,
  camping: MiCampingOutline,
  resort: MiBeachAccessOutline,
  villa: MiVillaOutline,
  restaurant: MiRestaurant,
  cafe: MiLocalCafeOutline,
  bar: MiLocalBarOutline,
  museum: MiMuseumOutline,
  shopping: MiShoppingBagOutline,
  cart: MiShoppingCartOutline,
  nature: MiParkOutline,
  beach: MiBeachAccessOutline,
  city: MiLocationCity,
  landmark: MiAccountBalanceOutline,
  hiking: MiHiking,
  spa: MiSpaOutline,
  theater: MiTheaterComedyOutline,
  sports: MiSportsOutline,
  airport: MiConnectingAirportsOutline,
  police: MiLocalPoliceOutline,
  fireDept: MiLocalFireDepartmentOutline,
  emergency: MiEmergencyOutline,
  medical: MiMedicalServicesOutline,
  sos: MiSos,
  // Weather
  weatherClear: MiWbSunnyOutline,
  weatherPartlyCloudy: MiPartlyCloudyDayOutline,
  weatherCloudy: MiCloudOutline,
  weatherRain: MiRainyOutline,
  weatherStorm: MiThunderstormOutline,
  weatherSnow: MiWeatherSnowyOutline,
  weatherFog: MiFoggyOutline,
  weatherWind: MiAir,
  weatherUnknown: MiDeviceThermostat,
  humidity: MiHumidityPercentageOutline,
  nightClear: MiBedtimeOutline,
  // Diet and food
  leaf: MiEcoOutline,
  nutrition: MiNutritionOutline,
  mosque: MiMosqueOutline,
  synagogue: MiSynagogueOutline,
  grain: MiGrain,
  noFood: MiNoFoodOutline,
  drink: MiLocalDrinkOutline,
  seafood: MiSetMealOutline,
  egg: MiEggAltOutline,
  grass: MiGrass,
  vaccine: MiVaccinesOutline,
  salt: MiWaterDropOutline,
  // Language phrases
  greeting: MiWavingHandOutline,
  courtesy: MiVolunteerActivismOutline,
} as const;

export type IconName = keyof typeof ICONS;

/** All registered names, for tests and pickers. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/**
 * The glyph as an SVG string, for non-React consumers such as Leaflet divIcons
 * (avoids pulling `react-dom/server` into the bundle). The glyph components are
 * plain functions that return an `<svg>` element, so we read its props.
 */
export function iconSvgString(name: IconName, size = 24): string {
  const glyph = ICONS[name] as unknown as (props: object) => {
    props: { viewBox: string; dangerouslySetInnerHTML: { __html: string } };
  };
  const { viewBox, dangerouslySetInnerHTML } = glyph({}).props;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${dangerouslySetInnerHTML.__html}</svg>`;
}
