export type Language = 'pl' | 'en';

export interface Translations {
  header: {
    subtitle: string;
    backendConnecting: string;
    backendOnline: string;
    backendBlocked: string;
    backendOffline: string;
    loadDemo: string;
    chungEstimation: string;
    themeToggleLight: string;
    themeToggleDark: string;
    langToggle: string;
    adblockTooltip: string;
    renderTooltip: string;
  };
  upload: {
    parsing: string;
    loaded: string;
    clickToChange: string;
    dropText: string;
    dropSubtext: string;
  };
  summary: {
    timeGainLoss: string;
    timeGainTooltipTitle: string;
    timeGainTooltipContent: string;
    timeGainTooltipPhysics: string;
    timeMatchBase: string;
    timeFaster: string;
    timeSlower: string;
    baseTime: string;
    simTime: string;
    eqPower: string;
    eqPowerTooltipTitle: string;
    eqPowerTooltipContent: string;
    eqPowerTooltipPhysics: string;
    eqPowerMatch: string;
    eqPowerRequired: string;
    avgSpeed: string;
    avgSpeedTooltipTitle: string;
    avgSpeedTooltipContent: string;
    avgSpeedTooltipPhysics: string;
    baseSpeed: string;
    distance: string;
    maxSpeed: string;
    modelElevation: string;
    modelElevationTooltipTitle: string;
    modelElevationTooltipContent: string;
    modelElevationTooltipPhysics: string;
    pacingMode: string;
    elevationGain: string;
    cyclistAero: string;
  };
  controls: {
    title: string;
    tooltipTitle: string;
    tooltipContent: string;
    resetWeather: string;
    resetWeatherTitle: string;
    weatherStation: string;
    weatherStationNotice: string;
    isaStation: string;
    isaStationNotice: string;
    zeroWindTitle: string;
    zeroWindDesc: string;
    windSpeedTitle: string;
    windSpeedTooltipTitle: string;
    windSpeedTooltipContent: string;
    windScaleTitle: string;
    windScaleTooltipTitle: string;
    windScaleTooltipContent: string;
    reverseRouteTitle: string;
    reverseRouteDesc: string;
    pacingStrategyTitle: string;
    pacingStrategyTooltipTitle: string;
    pacingStrategyTooltipContent: string;
    pacingOriginal: string;
    pacingOriginalDesc: string;
    pacingConstant: string;
    pacingConstantDesc: string;
    pacingAdaptive: string;
    pacingAdaptiveDesc: string;
    advancedTitle: string;
    advancedSubtitle: string;
    advancedTooltipTitle: string;
    advancedTooltipContent: string;
    massTitle: string;
    massTooltipTitle: string;
    massTooltipContent: string;
    cdaTitle: string;
    cdaTooltipTitle: string;
    cdaTooltipContent: string;
    crrTitle: string;
    crrTooltipTitle: string;
    crrTooltipContent: string;
    drivetrainLossTitle: string;
    etaTooltipTitle: string;
    etaTooltipContent: string;
    resetDefaults: string;
  };
  compass: {
    title: string;
    tooltipTitle: string;
    tooltipContent: string;
    tooltipPhysics: string;
    flowDirection: string;
    fromDirection: string;
    dragOrClick: string;
    rotateMinus45: string;
    rotatePlus45: string;
    reverse180: string;
    cardinals: {
      N: string;
      NE: string;
      E: string;
      SE: string;
      S: string;
      SW: string;
      W: string;
      NW: string;
    };
  };
  map: {
    title: string;
    headwind: string;
    crosswind: string;
    tailwind: string;
    noGps: string;
    start: string;
    finish: string;
    elevation: string;
    distance: string;
    speed: string;
  };
  charts: {
    title: string;
    elevation: string;
    baseSpeed: string;
    simSpeed: string;
    power: string;
    deltaTime: string;
    distance: string;
    slope: string;
    effective: string;
    acceleration: string;
    accumulatedDelta: string;
  };
  chung: {
    title: string;
    cdaEstimated: string;
    crrCoeff: string;
    rSquared: string;
    rmse: string;
    explanation: string;
    realElevation: string;
    virtualElevation: string;
    elevationAxis: string;
    close: string;
    applyCda: string;
  };
}

export const translations: Record<Language, Translations> = {
  pl: {
    header: {
      subtitle: 'Szacowanie prędkości roweru od wiatru & Metoda Chunga (VE)',
      backendConnecting: 'Łączenie z Renderem...',
      backendOnline: 'Render Online',
      backendBlocked: 'Zablokowane przez Adblock',
      backendOffline: 'Render Offline (połącz)',
      loadDemo: 'Wczytaj trasę demo (12 km)',
      chungEstimation: 'Estymacja CdA (Chung)',
      themeToggleLight: 'Przełącz na tryb jasny',
      themeToggleDark: 'Przełącz na tryb ciemny',
      langToggle: 'EN',
      adblockTooltip: 'Przeglądarka zablokowała zapytanie do serwera (ERR_BLOCKED_BY_CLIENT). Wyłącz wtyczkę Adblock, uBlock Origin lub Brave Shields dla strony miloszbuda.github.io, aby odblokować połączenie z Renderem.',
      renderTooltip: 'Serwer Render (Free Tier) może usypiać po 15 min bezczynności. Kliknij, aby sprawdzić i wybudzić serwer.',
    },
    upload: {
      parsing: 'Parsowanie pliku .FIT i pobieranie pogody z Open-Meteo ERA5...',
      loaded: 'Wczytano:',
      clickToChange: '(kliknij, aby zmienić plik)',
      dropText: 'Upuść tutaj plik aktywności',
      dropSubtext: 'Wspiera pliki Garmin / Wahoo / Hammerhead ze śladem GPS, mocą i prędkością',
    },
    summary: {
      timeGainLoss: 'Zysk / Strata Czasu',
      timeGainTooltipTitle: 'Zysk / Strata Czasu (Delta T)',
      timeGainTooltipContent: 'Różnica między czasem bazowym trasy (z pliku FIT) a czasem uzyskanym w symulacji (T_baza - T_sym). Wartość zielona oznacza czas zaoszczędzony (szybciej), czerwona stratę (wolniej), a 0s brak zmiany warunków.',
      timeGainTooltipPhysics: 'Na trasie zamkniętej (pętla) wiatr ZAWSZE powoduje stratę netto czasu. Opór powietrza rośnie z kwadratem prędkości (Faero ~ v²), a pod wiatr jedziesz wolniej, więc spędzasz na tym odcinku znacznie więcej czasu niż na szybkim powrocie z wiatrem w plecy.',
      timeMatchBase: '(zgodny z bazą)',
      timeFaster: 'szybciej',
      timeSlower: 'wolniej',
      baseTime: 'Baza',
      simTime: 'Sym',
      eqPower: 'Ekwiwalent Mocy',
      eqPowerTooltipTitle: 'Ekwiwalent Mocy (Equivalent Power)',
      eqPowerTooltipContent: 'Średnia moc kolarza w watach, jaka byłaby wymagana w nowych warunkach atmosferycznych, aby pokonać trasę w dokładnie takim samym czasie jak w przejeździe bazowym.',
      eqPowerTooltipPhysics: 'Wyliczany numerycznie metodą bisekcji na równaniu bilansu mocy i oporów Chunga z zachowaniem kinetyki bezwładności masy kolarza i roweru na zjazdach.',
      eqPowerMatch: 'Moc zgodna z bazową z pliku',
      eqPowerRequired: 'Moc potrzebna do zachowania czasu bazowego',
      avgSpeed: 'Średnia Prędkość',
      avgSpeedTooltipTitle: 'Prędkość i Dystans',
      avgSpeedTooltipContent: 'Porównanie średniej prędkości uzyskanej z modelu symulacyjnego z rzeczywistą średnią prędkością zarejestrowaną w pliku FIT.',
      avgSpeedTooltipPhysics: 'Model przelicza wektorowo kąt wiatru pozornego (apparent wind) i opór aerodynamiczny dla każdego 5-metrowego odcinka trasy.',
      baseSpeed: 'baza',
      distance: 'Dystans',
      maxSpeed: 'Max',
      modelElevation: 'Model Fizyki & Wzniesienia',
      modelElevationTooltipTitle: 'Parametry kolarza i trasy',
      modelElevationTooltipContent: 'Aktualna konfiguracja aerodynamiczna i fizyczna użyta w obliczeniach numerycznych.',
      modelElevationTooltipPhysics: 'Równanie mocy uwzględnia składowe: opór aero P_aero = 0.5*rho*CdA*(v+v_wind)², toczenie P_roll = Crr*m*g*v oraz grawitację P_grav = m*g*v*slope.',
      pacingMode: 'Pacing',
      elevationGain: 'Wzniesienia',
      cyclistAero: 'Kolarz',
    },
    controls: {
      title: 'Sterowanie wiatrem i symulacją',
      tooltipTitle: 'Symulacja warunków wiatrowych (What-If)',
      tooltipContent: 'Pozwala badać wpływ zmiany prędkości i kierunku wiatru, odwrócenia trasy oraz strategii pacingu na zysk lub stratę czasu. Model oparty jest na równaniu Chunga i wektorowej analizie wiatru pozornego.',
      resetWeather: 'Reset pogody',
      resetWeatherTitle: 'Przywróć oryginalną pogodę ze stacji i zresetuj delty do zera',
      weatherStation: 'Stacja pogodowa:',
      weatherStationNotice: 'Pobrano rzeczywiste dane stacyjne (temperatura, ciśnienie, wiatr) z alternatywnego serwisu w miejsce limitowanego Open-Meteo.',
      isaStation: 'Standardowa atmosfera (ISA):',
      isaStationNotice: 'Zastosowano model ISA (1013 hPa, gęstość ~1.20 kg/m³, wiatr bazowy 2.0 m/s) z powodu chwilowej niedostępności zewnętrznych stacji meteo. Możesz swobodnie testować warianty pogody suwakami i kompasem.',
      zeroWindTitle: 'Bezwietrznie',
      zeroWindDesc: 'Całkowite wyłączenie wiatru na całej trasie',
      windSpeedTitle: 'Prędkość wiatru',
      windSpeedTooltipTitle: 'Prędkość wiatru meteorologicznego',
      windSpeedTooltipContent: 'Prędkość wiatru na wysokości 10m przeliczona na profil przypowierzchniowy kolarza (wysokość efektywna 1.5m, szorstkość terenu z0=0.03).',
      windScaleTitle: 'Skalowanie wiatru stacyjnego',
      windScaleTooltipTitle: 'Mnożnik wiatru historycznego',
      windScaleTooltipContent: 'Skaluje rzeczywisty wektor wiatru z każdego punktu trasy (0x = brak wiatru, 1x = dane oryginalne, 2x = podwójna siła wiatru).',
      reverseRouteTitle: 'Odwróć kierunek trasy',
      reverseRouteDesc: 'Jazda w przeciwną stronę po tej samej pętli / trasie',
      pacingStrategyTitle: 'Strategia Pacingu',
      pacingStrategyTooltipTitle: 'Strategia rozkładu mocy kolarza',
      pacingStrategyTooltipContent: 'Wybiera, jak model ma symulować moc kolarza na trasie.',
      pacingOriginal: 'Oryginalny profil mocy (z pliku)',
      pacingOriginalDesc: 'Dokładnie taka sama moc na każdym metrze jak w rzeczywistym przejeździe',
      pacingConstant: 'Stała moc średnia (AP)',
      pacingConstantDesc: 'Równomierne tempo z idealną mocą średnią bez sprintów i przestojów',
      pacingAdaptive: 'Adaptacyjny do nachylenia',
      pacingAdaptiveDesc: 'Wyższa moc na podjazdach (+15%), niższa na zjazdach (-25%)',
      advancedTitle: 'Zaawansowane parametry fizyczne',
      advancedSubtitle: 'Masa, aerodynamika CdA, toczenie Crr i sprawność napędu',
      advancedTooltipTitle: 'Parametry fizyczne kolarza i sprzętu',
      advancedTooltipContent: 'Pozwalają precyzyjnie dostroić model do Twojej wagi, pozycji na rowerze oraz opon. Wartości są automatycznie zapamiętywane w przeglądarce.',
      massTitle: 'Masa zestawu (kg)',
      massTooltipTitle: 'Masa całkowita zestawu (kg)',
      massTooltipContent: 'Łączna masa kolarza, roweru, bidonów, kasku, butów i wyposażenia. Wpływa bezpośrednio na siłę grawitacji na podjazdach oraz bezwładność kinetyczną.',
      cdaTitle: 'CdA oporu (m²)',
      cdaTooltipTitle: 'Współczynnik aerodynamiczny CdA (m²)',
      cdaTooltipContent: 'Iloczyn współczynnika oporu Cd i powierzchni czołowej A.\n\nSugerowane wartości:\n• TT / czasówka / triathlon: 0.20–0.24 m²\n• Szosa (dolny chwyt / baranek): 0.28–0.32 m²\n• Szosa (chwyt za klamkomanetki): 0.33–0.38 m²\n• Gravel / szosa endurance: 0.36–0.42 m²\n• MTB / pozycja wyprostowana: 0.40–0.50 m²',
      crrTitle: 'Opór toczenia Crr',
      crrTooltipTitle: 'Współczynnik oporu toczenia Crr',
      crrTooltipContent: 'Opór toczenia opon po nawierzchni asfaltowej.\n\nSugerowane wartości (dobry asfalt):\n• Nowoczesne opony szosowe tubeless (np. GP5000 S TR): 0.0030–0.0038\n• Wysokiej klasy opony z dętką TPU / lateks: 0.0038–0.0045\n• Standardowe opony z dętką butylową: 0.0045–0.0055\n• Opony gravelowe / all-road (38–45mm): 0.0060–0.0080\n• Opony MTB / zniszczony, szorstki asfalt: 0.0080–0.0120',
      drivetrainLossTitle: 'Sprawność napędu η',
      etaTooltipTitle: 'Sprawność napędu łańcuchowego η',
      etaTooltipContent: 'Ułamek energii mechanicznej przekazywanej z korby na tylne koło (1 - straty tarcia).\n\nSugerowane wartości:\n• Czysty, wywoskowany łańcuch szosowy: 0.975–0.980 (97.5–98%)\n• Dobrze nasmarowany i wyczyszczony napęd: 0.965–0.975 (96.5–97.5%)\n• Typowy napęd treningowy / gravel: 0.950–0.965 (95–96.5%)\n• Zabrudzony lub zużyty napęd: 0.920–0.940 (92–94%)',
      resetDefaults: 'Przywróć domyślne parametry',
    },
    compass: {
      title: 'Kierunek wiatru',
      tooltipTitle: 'Kierunek wiatru i strumień powietrza',
      tooltipContent: 'Strzałka wskazuje kierunek przepływu powietrza (dokąd wieje wiatr). Kąt meteorologiczny w nawiasie określa kierunek, Z KTÓREGO wieje wiatr. Kliknij w dowolne miejsce tarczy lub przeciągaj igłę, aby skierować strumień wiatru.',
      tooltipPhysics: 'Wektor wiatru łączy się z prędkością kolarza tworząc wiatr pozorny (apparent wind), decydujący o oporze aerodynamicznym.',
      flowDirection: 'Przepływ',
      fromDirection: 'Z',
      dragOrClick: 'Przeciągnij / Kliknij',
      rotateMinus45: 'Obróć o 45° w lewo',
      rotatePlus45: 'Obróć o 45° w prawo',
      reverse180: 'Odwróć wiatr o 180°',
      cardinals: {
        N: 'Północ',
        NE: 'Pn-Wsch',
        E: 'Wschód',
        SE: 'Pd-Wsch',
        S: 'Południe',
        SW: 'Pd-Zach',
        W: 'Zachód',
        NW: 'Pn-Zach',
      },
    },
    map: {
      title: 'Mapa trasy i wektory wiatru',
      headwind: 'Wiatr czołowy',
      crosswind: 'Boczny',
      tailwind: 'W plecy',
      noGps: 'Brak danych trasy GPS do wyświetlenia mapy',
      start: 'Start trasy',
      finish: 'Meta trasy',
      elevation: 'Wysokość:',
      distance: 'Dystans:',
      speed: 'Prędkość:',
    },
    charts: {
      title: 'Telemetria trasy',
      elevation: 'Wysokość (m)',
      baseSpeed: 'Prędkość bazowa (km/h)',
      simSpeed: 'Prędkość symulowana (km/h)',
      power: 'Moc (W)',
      deltaTime: 'Delta czasu (s)',
      distance: 'Dystans:',
      slope: 'Nachylenie:',
      effective: 'efekt:',
      acceleration: 'Przyspieszenie:',
      accumulatedDelta: 'Skumulowana delta czasu:',
    },
    chung: {
      title: 'Estymacja Aerodynamiki metodą Chunga (Virtual Elevation)',
      cdaEstimated: 'Wyestymowane CdA',
      crrCoeff: 'Współczynnik Crr',
      rSquared: 'Dopasowanie R²',
      rmse: 'Błąd RMSE',
      explanation: 'Metoda wirtualnego przewyższenia (Chung VE) całkuje równanie bilansu energii. Gdy wyznaczone CdA odpowiada rzeczywistemu oporowi kolarza, wirtualny profil wysokości idealnie pokrywa się z faktyczną topografią terenu, kompensując zmiany energii kinetycznej.',
      realElevation: 'Wysokość rzeczywista (m)',
      virtualElevation: 'Wirtualna wysokość Chunga h_virt (m)',
      elevationAxis: 'Wysokość (m)',
      close: 'Zamknij',
      applyCda: 'Zastosuj to CdA do symulacji',
    },
  },
  en: {
    header: {
      subtitle: 'Aerodynamic Bike Speed Simulation & Chung\'s Method (VE)',
      backendConnecting: 'Connecting to Render...',
      backendOnline: 'Render Online',
      backendBlocked: 'Blocked by Adblock',
      backendOffline: 'Render Offline (reconnect)',
      loadDemo: 'Load demo ride (12 km)',
      chungEstimation: 'CdA Estimation (Chung)',
      themeToggleLight: 'Switch to light mode',
      themeToggleDark: 'Switch to dark mode',
      langToggle: 'PL',
      adblockTooltip: 'Browser blocked backend request (ERR_BLOCKED_BY_CLIENT). Disable Adblock, uBlock Origin, or Brave Shields for miloszbuda.github.io to allow connection to Render.',
      renderTooltip: 'Render server (Free Tier) spins down after 15 min of inactivity. Click to wake up and check status.',
    },
    upload: {
      parsing: 'Parsing .FIT file and fetching weather from Open-Meteo ERA5...',
      loaded: 'Loaded:',
      clickToChange: '(click to change file)',
      dropText: 'Drop your activity file here',
      dropSubtext: 'Supports Garmin / Wahoo / Hammerhead files with GPS, power, and speed',
    },
    summary: {
      timeGainLoss: 'Time Gain / Loss',
      timeGainTooltipTitle: 'Time Gain / Loss (Delta T)',
      timeGainTooltipContent: 'Difference between baseline route time (from FIT file) and simulated time (T_base - T_sim). Green indicates saved time (faster), red indicates lost time (slower), and 0s matches baseline conditions.',
      timeGainTooltipPhysics: 'On a closed loop, wind ALWAYS causes a net time penalty. Aerodynamic drag scales with velocity squared (Faero ~ v²), and riding into a headwind lowers speed, meaning you spend much more time fighting it than you save with a tailwind.',
      timeMatchBase: '(matches baseline)',
      timeFaster: 'faster',
      timeSlower: 'slower',
      baseTime: 'Base',
      simTime: 'Sim',
      eqPower: 'Equivalent Power',
      eqPowerTooltipTitle: 'Equivalent Power',
      eqPowerTooltipContent: 'Average cyclist power in watts required under the new simulated weather conditions to complete the route in the exact same time as the baseline ride.',
      eqPowerTooltipPhysics: 'Calculated numerically using bisection on Chung\'s power balance equation, preserving cyclist and bike inertial kinetics on descents.',
      eqPowerMatch: 'Power matches baseline file',
      eqPowerRequired: 'Power required to match baseline time',
      avgSpeed: 'Average Speed',
      avgSpeedTooltipTitle: 'Speed and Distance',
      avgSpeedTooltipContent: 'Comparison of average speed from the simulation model against the actual recorded speed in the FIT file.',
      avgSpeedTooltipPhysics: 'The model computes the apparent wind vector and aerodynamic drag for every 5-meter segment of the route.',
      baseSpeed: 'base',
      distance: 'Distance',
      maxSpeed: 'Max',
      modelElevation: 'Physics Model & Elevation',
      modelElevationTooltipTitle: 'Rider & Route Parameters',
      modelElevationTooltipContent: 'Current aerodynamic and physical configuration used in numerical calculations.',
      modelElevationTooltipPhysics: 'Power equation accounts for: P_aero = 0.5*rho*CdA*(v+v_wind)², rolling P_roll = Crr*m*g*v, and gravity P_grav = m*g*v*slope.',
      pacingMode: 'Pacing',
      elevationGain: 'Elevation',
      cyclistAero: 'Rider',
    },
    controls: {
      title: 'Wind & Simulation Controls',
      tooltipTitle: 'Wind Condition Simulation (What-If)',
      tooltipContent: 'Simulates the impact of varying wind speed, wind direction, reverse route orientation, and pacing strategies on time gain/loss. Based on Chung\'s equation and vector apparent wind physics.',
      resetWeather: 'Reset weather',
      resetWeatherTitle: 'Restore original weather station data and reset deltas to zero',
      weatherStation: 'Weather Station:',
      weatherStationNotice: 'Real station data (temperature, pressure, wind) was fetched from an alternative weather provider due to Open-Meteo rate limits.',
      isaStation: 'Standard Atmosphere (ISA):',
      isaStationNotice: 'Using the ISA model (1013 hPa, air density ~1.20 kg/m³, baseline wind 2.0 m/s) due to temporary unavailability of weather stations. You can test weather variants using the sliders and compass.',
      zeroWindTitle: 'Zero Wind',
      zeroWindDesc: 'Complete wind shutoff along the entire route',
      windSpeedTitle: 'Wind Speed',
      windSpeedTooltipTitle: 'Meteorological Wind Speed',
      windSpeedTooltipContent: '10m wind speed scaled down to rider height (1.5m effective height, surface roughness z0=0.03).',
      windScaleTitle: 'Station Wind Scaling',
      windScaleTooltipTitle: 'Historical Wind Multiplier',
      windScaleTooltipContent: 'Scales the recorded wind vector at each route point (0x = no wind, 1x = original, 2x = double wind).',
      reverseRouteTitle: 'Reverse Route Direction',
      reverseRouteDesc: 'Ride the course in the opposite direction',
      pacingStrategyTitle: 'Pacing Strategy',
      pacingStrategyTooltipTitle: 'Power Distribution Strategy',
      pacingStrategyTooltipContent: 'Selects how the simulation models rider effort across the course.',
      pacingOriginal: 'Original power profile (from file)',
      pacingOriginalDesc: 'Exact same power output at every meter as recorded in the real ride',
      pacingConstant: 'Constant average power (AP)',
      pacingConstantDesc: 'Even-paced effort at average power without spikes or coasting',
      pacingAdaptive: 'Gradient-adaptive pacing',
      pacingAdaptiveDesc: 'Higher power on climbs (+15%), lower power on descents (-25%)',
      advancedTitle: 'Advanced Physics Parameters',
      advancedSubtitle: 'Mass, CdA aerodynamics, Crr rolling resistance, and drivetrain efficiency',
      advancedTooltipTitle: 'Rider and Equipment Physics',
      advancedTooltipContent: 'Fine-tune the model to your body mass, riding position, and tires. Values are automatically saved in your browser.',
      massTitle: 'Total mass (kg)',
      massTooltipTitle: 'Total System Mass (kg)',
      massTooltipContent: 'Combined mass of rider, bicycle, water bottles, helmet, shoes, and gear. Directly determines gravitational resistance on ascents and kinetic inertia.',
      cdaTitle: 'Aero drag CdA (m²)',
      cdaTooltipTitle: 'Aerodynamic Drag Area CdA (m²)',
      cdaTooltipContent: 'Product of aerodynamic drag coefficient Cd and frontal area A.\n\nSuggested benchmarks:\n• TT / Triathlon: 0.20–0.24 m²\n• Road drops (aerodynamic): 0.28–0.32 m²\n• Road hoods (standard): 0.33–0.38 m²\n• Gravel / Endurance upright: 0.36–0.42 m²\n• MTB / Flat bar upright: 0.40–0.50 m²',
      crrTitle: 'Rolling resistance Crr',
      crrTooltipTitle: 'Rolling Resistance Coefficient Crr',
      crrTooltipContent: 'Coefficient of rolling friction between tires and asphalt.\n\nSuggested benchmarks (smooth pavement):\n• Modern road tubeless (e.g. GP5000 S TR): 0.0030–0.0038\n• High-end clinchers with TPU / latex tubes: 0.0038–0.0045\n• Standard road tires with butyl tubes: 0.0045–0.0055\n• Gravel / all-road tires (38–45mm): 0.0060–0.0080\n• MTB tires / rough coarse pavement: 0.0080–0.0120',
      drivetrainLossTitle: 'Drivetrain efficiency η',
      etaTooltipTitle: 'Drivetrain Efficiency η',
      etaTooltipContent: 'Fraction of mechanical pedaling power transferred to the rear wheel (1 - friction losses).\n\nSuggested benchmarks:\n• Clean, hot-melt waxed chain: 0.975–0.980 (97.5–98%)\n• Clean, properly oiled road drivetrain: 0.965–0.975 (96.5–97.5%)\n• Typical road / gravel training bike: 0.950–0.965 (95–96.5%)\n• Dirty or worn chain / cassette: 0.920–0.940 (92–94%)',
      resetDefaults: 'Reset to default parameters',
    },
    compass: {
      title: 'Wind Direction',
      tooltipTitle: 'Wind Direction & Airflow Vector',
      tooltipContent: 'The arrow points in the direction the air flows (where the wind is blowing towards). Meteorological angle indicates the direction the wind blows FROM. Click anywhere on the dial or drag the needle to aim the airflow.',
      tooltipPhysics: 'True wind combines vectorially with cyclist ground velocity to form apparent wind, governing aerodynamic drag.',
      flowDirection: 'Flow',
      fromDirection: 'From',
      dragOrClick: 'Drag / Click',
      rotateMinus45: 'Rotate 45° left',
      rotatePlus45: 'Rotate 45° right',
      reverse180: 'Reverse wind 180°',
      cardinals: {
        N: 'North',
        NE: 'North-East',
        E: 'East',
        SE: 'South-East',
        S: 'South',
        SW: 'South-West',
        W: 'West',
        NW: 'North-West',
      },
    },
    map: {
      title: 'Route Map & Wind Vectors',
      headwind: 'Headwind',
      crosswind: 'Crosswind',
      tailwind: 'Tailwind',
      noGps: 'No GPS route data to display on map',
      start: 'Start',
      finish: 'Finish',
      elevation: 'Elevation:',
      distance: 'Distance:',
      speed: 'Speed:',
    },
    charts: {
      title: 'Route Telemetry',
      elevation: 'Elevation (m)',
      baseSpeed: 'Baseline speed (km/h)',
      simSpeed: 'Simulated speed (km/h)',
      power: 'Power (W)',
      deltaTime: 'Time delta (s)',
      distance: 'Distance:',
      slope: 'Slope:',
      effective: 'eff:',
      acceleration: 'Acceleration:',
      accumulatedDelta: 'Cumulative time delta:',
    },
    chung: {
      title: 'Chung Method Aerodynamic Estimation (Virtual Elevation)',
      cdaEstimated: 'Estimated CdA',
      crrCoeff: 'Crr Coefficient',
      rSquared: 'Fit R²',
      rmse: 'RMSE Error',
      explanation: 'The Virtual Elevation method (Chung VE) integrates the power-energy balance. When estimated CdA reflects real aerodynamic drag, the virtual elevation profile closely matches true topography by accounting for kinetic energy changes.',
      realElevation: 'Real Elevation (m)',
      virtualElevation: 'Virtual Elevation h_virt (m)',
      elevationAxis: 'Elevation (m)',
      close: 'Close',
      applyCda: 'Apply this CdA to simulation',
    },
  },
};
