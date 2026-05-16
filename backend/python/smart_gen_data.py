"""
Shared data pools and column-generation logic used by generate-from-schema
and generate-hybrid endpoints.
"""
import random
import string
import uuid as uuid_module
from datetime import datetime, timedelta
from typing import Any

import numpy as np

FIRST = [
    # Filipino male
    "Jose","Juan","Miguel","Carlo","Antonio","Ricardo","Eduardo","Fernando","Ramon","Roberto",
    "Noel","Christian","Ryan","Kenneth","Angelo","Jerome","Jason","Brian","Kevin","Ronald",
    "Emmanuel","Alex","Ivan","Dennis","Arnold","Gilbert","Bernard","Virgilio","Andres","Rodrigo",
    "Mark","John","Patrick","James","Daniel","Michael","David","Joseph","Robert","Christopher",
    # Filipino female
    "Maria","Ana","Rosa","Carmen","Elena","Linda","Grace","Marisol","Luz","Cristina",
    "Fatima","Lourdes","Teresa","Corazon","Dolores","Jessica","Karen","Michelle","Patricia","Sandra",
    "Angelica","Kristine","Jenny","Stephanie","Nicole","Maricel","Rowena","Jennylyn","Precious","Lovely",
    # International
    "Alice","Bob","Diana","Eve","Frank","Henry","Iris","Leo","Nathan","Oliver",
    "Priya","Quinn","Rachel","Samuel","Tina","Emma","Liam","Sophia","Noah","Ava",
    "William","Isabella","James","Mia","Benjamin","Charlotte","Lucas","Amelia","Mason","Harper",
]

LAST = [
    # Filipino
    "Santos","Reyes","Cruz","Bautista","Ocampo","Garcia","Mendoza","Torres","Tan","Flores",
    "Gonzales","Lopez","Ramos","Villanueva","Castro","Morales","Aquino","De Leon","Dela Cruz","Fernandez",
    "Salvador","Bernardo","Pascual","Tolentino","Santiago","Francisco","Aguilar","Navarro","Castillo","Guevara",
    "Rivera","Macaraeg","Soriano","Espiritu","Macapagal","Sison","Lacson","Dizon","Manalo","Pangilinan",
    "Corpuz","Enriquez","Mercado","Buenaventura","Constantino","Delos Santos","Estrada","Ilagan","Jimenez","Lim",
    # International
    "Smith","Johnson","Williams","Brown","Jones","Davis","Miller","Wilson","Moore","Taylor",
    "Anderson","Martinez","Lee","Thompson","White","Harris","Clark","Lewis","Walker","Hall",
    "Young","Allen","King","Wright","Scott","Green","Baker","Adams","Nelson","Carter",
]

STREETS = [
    "Main St","Oak Ave","Pine Rd","Elm St","Cedar Ln","Maple Dr",
    "River Rd","Park Blvd","Sunset Blvd","Lake Dr",
]

PH_STREETS = [
    "Rizal Avenue","Aguinaldo Highway","EDSA","Commonwealth Avenue","Aurora Boulevard",
    "Katipunan Avenue","España Boulevard","Taft Avenue","Roxas Boulevard","Quezon Avenue",
    "Marcos Highway","Ortigas Avenue","Shaw Boulevard","Timog Avenue","Ayala Avenue",
    "Makati Avenue","Gil Puyat Avenue","P. Burgos Street","C.P. Garcia Avenue",
    "White Plains Avenue","Boni Avenue","Scout Rallos Street","Quezon Boulevard",
    "C5 Road","Mindanao Avenue","East-West Road","McArthur Highway","Magsaysay Avenue",
    "Circumferential Road","Session Road","Osmeña Boulevard","Colon Street",
    "Mango Avenue","General Maxilom Avenue","Imus Boulevard","Governor's Drive",
    "Molino Boulevard","Zapote Road","Coastal Road","Laguna Boulevard",
    "National Highway","Provincial Road","Barangay Road","Mayon Street",
    "Sampaguita Street","Maharlika Highway","Bonifacio Street","Mabini Street",
]

PH_MOBILE_PREFIXES = [
    "0905","0906","0915","0916","0917","0918","0919","0920","0921","0922",
    "0923","0926","0927","0928","0929","0932","0933","0935","0936","0939",
    "0942","0943","0945","0946","0948","0949","0951","0955","0956","0961",
    "0965","0966","0975","0976","0977","0978","0995","0996","0997","0998","0999",
]

# ── Philippine geographic data: city → (province, [barangays]) ───────────────
# Covers NCR and Region 3 (Central Luzon) in full; other regions have lighter coverage.
_PH_GEO: dict[str, tuple[str, list[str]]] = {
    # ── NCR ──────────────────────────────────────────────────────────────────
    "Manila": ("Metro Manila", [
        "Binondo","Ermita","Intramuros","Malate","Paco","Pandacan",
        "Port Area","Quiapo","Sampaloc","San Andres","San Miguel",
        "San Nicolas","Santa Ana","Santa Cruz","Santa Mesa","Tondo",
    ]),
    "Quezon City": ("Metro Manila", [
        "Apolonio Samson","Bagbag","Bagong Pag-asa","Bagong Silangan",
        "Bagumbayan","Batasan Hills","Betterliving","Caloocan","Commonwealth",
        "Cubao","Diliman","Don Manuel","Escopa","Fairview","Holy Spirit",
        "Kamuning","Krus na Ligas","Loyola Heights","Matandang Balara",
        "New Era","Novaliches Proper","Payatas","Project 6","Project 7",
        "San Bartolome","San Isidro Labrador","Sta. Lucia","Sta. Monica",
        "Tandang Sora","UP Campus","Veterans Village","White Plains",
    ]),
    "Makati": ("Metro Manila", [
        "Bel-Air","Cembo","Comembo","Dasmariñas Village","East Rembo",
        "Forbes Park","Guadalupe Nuevo","Guadalupe Viejo","Kasilawan",
        "La Paz","Legaspi Village","Magallanes","Olympia","Palanan",
        "Pembo","Pinagkaisahan","Pio del Pilar","Poblacion","Post Proper Northside",
        "Post Proper Southside","Rizal","Rockwell","Salcedo Village",
        "San Antonio","San Isidro","San Lorenzo","Santa Cruz","South Cembo",
        "Tejeros","Urdaneta","West Rembo",
    ]),
    "Taguig": ("Metro Manila", [
        "Bagumbayan","Bambang","Calzada","Central Bicutan","Central Signal Village",
        "Fort Bonifacio","Hagonoy","Ibayo-Tipas","Katuparan","Ligid-Tipas",
        "Lower Bicutan","Maharlika Village","Napindan","New Lower Bicutan",
        "North Daang Hari","North Signal Village","Palingon","Pinagsama",
        "San Miguel","Scintilla","South Daang Hari","South Signal Village",
        "Tanyag","Tuktukan","Upper Bicutan","Ususan","Wawa","Western Bicutan",
    ]),
    "Pasig": ("Metro Manila", [
        "Bagong Ilog","Bagong Katipunan","Bambang","Buting","Caniogan",
        "Capitol","Dela Paz","Kalawaan","Kapitolyo","Malinao","Manggahan",
        "Maybunga","Oranbo","Palatiw","Pinagbuhatan","Pineda","Rosario",
        "Sagad","San Antonio","San Joaquin","San Jose","San Miguel",
        "Santa Cruz","Santa Lucia","Santa Rosa","Santo Tomas","Santolan",
        "Sumilang","Ugong",
    ]),
    "Marikina": ("Metro Manila", [
        "Barangka","Calumpang","Concepcion Dos","Concepcion Uno","Fortune",
        "Industrial Valley","Jesus dela Peña","Malanday","Marikina Heights",
        "Nangka","Parang","San Roque","Sta. Elena","Sto. Niño","Tañong","Tumana",
    ]),
    "Mandaluyong": ("Metro Manila", [
        "Addition Hills","Bagong Silang","Barangka Drive","Barangka Ibaba",
        "Barangka Ilaya","Buayang Bato","Burol","Daang Bakal","Hagdang Bato Itaas",
        "Hagdang Bato Libis","Harapin ang Bukas","Highway Hills","Hulo",
        "Mauway","Namayan","New Zañiga","Old Zañiga","Pag-asa",
        "Plainview","Pleasant Hills","Poblacion","San Joaquin","Vergara","Wack-Wack",
    ]),
    "Parañaque": ("Metro Manila", [
        "B.F. Homes","Baclaran","Don Bosco","Don Galo","La Huerta",
        "Marcelo Green Village","Merville","Moonwalk","San Antonio",
        "San Dionisio","San Isidro","San Martin de Porres","San Pedro",
        "Santo Niño","Tambo","Vitalez",
    ]),
    "Las Piñas": ("Metro Manila", [
        "Almanza Dos","Almanza Uno","B.F. International Village",
        "Daniel Fajardo","Elias Aldana","Ilaya","Manuyo Dos","Manuyo Uno",
        "Pamplona Dos","Pamplona Tres","Pamplona Uno","Pilar",
        "Pulang Lupa Dos","Pulang Lupa Uno","Talon Dos","Talon Tres",
        "Talon Uno","Talon Cuatro","Talon Cinco",
    ]),
    "Caloocan": ("Metro Manila", [
        "Bagong Barrio","Bagong Silang","Baesa","Biglang Awa","Camarin",
        "Dagat-dagatan","Deparo","Gracepark","Kaunlaran","La Mesa",
        "Llano","Maypajo","MH del Pilar","Monumento","Noresie",
        "North Caloocan","Novaliches","Pangarap","San Jose","Tipas",
        "Tala","Barangay 1 thru 50 (South)",
    ]),
    "Muntinlupa": ("Metro Manila", [
        "Alabang","Ayala Alabang Village","Bayanan","Buli","Cupang",
        "New Alabang Village","Poblacion","Putatan","Sucat","Tunasan",
    ]),
    "Pasay": ("Metro Manila", [
        "Aseana Business Park","Baclaran","Bagong Ilog","Bagong Pag-asa",
        "Don Bosco","Malibay","Maricaban","MIA Area","Ninoy Aquino Airport Area",
        "San Isidro","San Roque","Santa Clara","Victory Village",
    ]),
    "Valenzuela": ("Metro Manila", [
        "Arkong Bato","Balangkas","Bignay","Bisig","Canumay East","Canumay West",
        "Coloong","Dalandanan","Fortune","Gen. T. de Leon","Isla","Karuhatan",
        "Lawang Bato","Lingunan","Mabolo","Malanday","Malinta","Mapulang Lupa",
        "Marulas","Maysan","Parada","Paso de Blas","Pasolo","Polo","Punturin",
        "Ugong","Viente Reales","Wawang Pulo",
    ]),
    "Malabon": ("Metro Manila", [
        "Acacia","Baritan","Catmon","Concepcion","Dampalit","Flores",
        "Hulong Duhat","Ibaba","Longos","Maysilo","Niugan","Panghulo",
        "Potrero","San Agustin","Santolan","Tinajeros","Tonsuya","Tugatog",
    ]),
    "Navotas": ("Metro Manila", [
        "Bangculasi","Daanghari","Navotas East","Navotas West",
        "North Bay Blvd. North","North Bay Blvd. South",
        "San Jose","San Roque","Sipac-Almacen","Tangos",
    ]),
    "San Juan": ("Metro Manila", [
        "Addition Hills","Balong Bato","Batis","Corazon de Jesus",
        "Ermitaño","Greenhills","Kabayanan","Little Baguio",
        "Maytunas","Onse","Pasadena","Pedro Cruz","Salapan",
        "St. Joseph","Tibagan","West Crame",
    ]),
    # ── Region 3 — Bulacan ───────────────────────────────────────────────────
    "Malolos City": ("Bulacan", [
        "Bulihan","Caingin","Calero","Canalate","Caniogan","Catmon",
        "Cofradia","Dakila","Guinhawa","Ligas","Lugam","Mabolo","Mambog",
        "Masile","Matimbo","Mojon","Namayan","Niugan","Pamarawan",
        "Pinagbakahan","San Agustin","San Gabriel","San Juan","Santelmo",
        "Santisima Trinidad","Santo Cristo","Santo Niño","Sumapang Bata",
        "Sumapang Matanda","Tikay","Turo",
    ]),
    "Meycauayan City": ("Bulacan", [
        "Bancal","Banga","Bayugo","Caingin","Calvario","Camalig","Catmon",
        "Caypombo","Langka","Lawa","Libtong","Malhacan","Pag-asa",
        "Pandayan","Pantoc","Perez","Poblacion","Saluysoy","Tagasan",
        "Tugatog","Ubihan","Zamora",
    ]),
    "San Jose del Monte City": ("Bulacan", [
        "Assumption","Bagong Buhay","Bagong Nayon 1","Bagong Nayon 2",
        "Citrus","Dulong Bayan","Fatima 1","Fatima 2","Fatima 3","Fatima 4","Fatima 5",
        "Gaya-gaya","Graceville","Kaybanban","Maharlika","Muzon",
        "Paradise 1","Paradise 2","Paradise 3","Poblacion","Sapang Palay",
        "St. Martin de Porres","Sto. Cristo",
    ]),
    "Sta. Maria": ("Bulacan", [
        "Bagbaguin","Balasing","Buenavista","Camangyanan","Catmon",
        "Guyong","Lalakhan","Mag-asawang Sapa","Malamig","Manggahan",
        "Parada","Poblacion","Pulong Buhangin","San Gabriel",
        "San Jose","Santo Cristo","Santo Niño","Silangan","Tumana",
    ]),
    "Marilao": ("Bulacan", [
        "Abangan Norte","Abangan Sur","Ibayo","Lambakin","Lias",
        "Loma de Gato","Nagbalon","Paldera","Patubig","Poblacion","Prenza 1",
        "Prenza 2","Saog","Tabing Ilog",
    ]),
    "Bocaue": ("Bulacan", [
        "Batia","Binagbag","Dulong Malabon","Igbita","Longos","Loriando",
        "Malipampang","Nipa","Pantubig","Patigui","Quinabucan",
        "Sta. Ana","Sta. Clara","Wakas",
    ]),
    "Balagtas": ("Bulacan", [
        "Borol 1st","Borol 2nd","Dalig","Longos","Panginay","Poblacion",
        "Sta. Barbara","Wawa",
    ]),
    "Guiguinto": ("Bulacan", [
        "Burol 1","Burol 2","Burol 3","Ilang-ilang","Malis","Panginay",
        "Sta. Cruz","Sta. Cruz na Burol","Sta. Rita","Tabang","Tabe",
    ]),
    "Plaridel": ("Bulacan", [
        "Agnaya","Banga","Binuangan","Calizon","Consuelo","Culianin",
        "Dampol 1","Dampol 2a","Dampol 2b","Dangging","Gandus","Liciada",
        "Linawan","Malimba","Matatalaib","Maysantol","Naning","Parulan",
        "Platero","Poblacion","Pungo","San Jose","Santa Ines","Tulisan",
    ]),
    # ── Region 3 — Pampanga ──────────────────────────────────────────────────
    "Angeles City": ("Pampanga", [
        "Agapito del Rosario","Amsic","Anunas","Balibago","Capaya",
        "Claro M. Recto","Cuayan","Cutcut","Cutud","Lourdes Norte","Lourdes Sur",
        "Malabañas","Margot","Marisol","Mining","Pampang","Pandan",
        "Pulung Bulo","Pulung Cacutud","Pulung Maragul","Salapungan",
        "San Jose","San Nicolas","Santa Teresita","Santa Trinidad",
        "Santo Cristo","Santo Domingo","Santo Rosario","Sapalibutad",
        "Sapangbato","Tabun","Virgen Delos Remedios",
    ]),
    "San Fernando City": ("Pampanga", [
        "Alasas","Baliti","Bulaon","Calulut","Del Carmen","Del Pilar",
        "Del Rosario","Dela Paz Norte","Dela Paz Sur","Dolores",
        "Juliana","Lara","Magliman","Maimpis","Malino","Malpitic",
        "Pandaras","Panipuan","Pulung Bulu","Quebiawan","Saguin",
        "San Agustin","San Felipe","San Isidro","San Jose","San Juan",
        "San Nicolas","San Pedro","Santa Lucia","Santa Teresita",
        "Santo Niño","Santo Rosario","Sindalan","Telabastagan",
    ]),
    "Mabalacat City": ("Pampanga", [
        "Atlu-Bola","Bical","Bundagul","Cacutud","Calumpang","Camachiles",
        "Dapdap","Dau","Dolores","Duquit","Lakandula","Mawaque",
        "Paralayunan","Poblacion","San Francisco","San Joaquin",
        "Santa Ines","Santa Maria","Santo Rosario","Sapang Balen","Tabun",
    ]),
    "Mexico": ("Pampanga", [
        "Anao","Balas","Buenavista","Camuning","Cawayan Bugtong",
        "Concepcion","Culubasa","Divisoria","Dolores","Eden","Gandus",
        "Lagundi","Laput","Laug","Lazatin","Masamat","Masangsang",
        "Nueva Victoria","Parian","Poblacion","San Antonio","San Carlos",
        "San Jose Malino","San Jose Matulid","San Juan","San Lorenzo",
        "San Miguel","San Nicolas","San Pablo","San Patricio","San Rafael",
        "San Roque","San Vicente","Santa Cruz","Santa Maria","Santo Tomas",
        "Sapang Maisac","Suclaban","Tangle",
    ]),
    "Apalit": ("Pampanga", [
        "Balucuc","Calantipe","Capalangan","Colgante","Paligui",
        "Sampaloc","San Juan","San Vicente","Sucad","Sulipan","Tabuyuc",
    ]),
    "Guagua": ("Pampanga", [
        "Ascomo","Bancal","Bancal Pugad","Bancal Sinubli","Buayas","Calabutbut",
        "Magsaysay","Maquiapo","Natividad","Pulungmasle","Rizal","San Agustin",
        "San Antonio","San Isidro","San Juan Banal","San Juan Bano","San Miguel",
        "San Nicolas","San Pablo","San Pedro","Santa Filomena","Santo Niño",
        "Santo Tomas","Uguis","Umingan",
    ]),
    # ── Region 3 — Zambales ──────────────────────────────────────────────────
    "Olongapo City": ("Zambales", [
        "Barangay 1","Barangay 2","Barangay 3","Barangay 4","Barangay 5",
        "Barangay 6","Barangay 7","Barangay 8","Barangay 9","Barangay 10",
        "Barangay 11","Barangay 12","Barangay 13","Barangay 14","Barangay 15",
        "Barangay 16","Barangay 17","Barretto","East Bajac-Bajac",
        "West Bajac-Bajac","East Tapinac","West Tapinac","Gordon Heights",
        "Kalaklan","Mabayuan","New Cabalan","Old Cabalan","Pag-asa","Sta. Rita",
    ]),
    "Subic": ("Zambales", [
        "Asinan","Calapacuan","Calapandayan","Cawag","Ilwas",
        "Mangan-Vaca","Matain","Naugsol","Pamatawan","San Isidro",
        "Santo Tomas","Subic Bay Freeport Zone","Wawandue",
    ]),
    "Iba": ("Zambales", [
        "Bangantalinga","Dirita-Baloguen","Lipay-Dingin-Panibuatan",
        "Palanginan","Poblacion","San Agustin","San Juan",
        "Sta. Barbara","Sto. Rosario",
    ]),
    "Castillejos": ("Zambales", [
        "Balaybay","Buenavista","Del Pilar","Looc","Magsaysay","Nagbayan",
        "Nagbayani","Pal-ompon","Palanguian","Poblacion","San Alberto","San Jose",
        "San Pablo","Sta. Maria","Sto. Niño",
    ]),
    "San Antonio": ("Zambales", [
        "Burgos","East Poblacion","Pundaquit","San Isidro","San Jose",
        "San Nicolas","Sta. Fe","Sto. Tomas","Tejero","West Poblacion",
    ]),
    # ── Region 3 — Bataan ────────────────────────────────────────────────────
    "Balanga City": ("Bataan", [
        "Bagong Silang","Cabog-cabog","Camacho","Cataning","Central",
        "Cupang Norte","Cupang Proper","Cupang West","Dangcol","Ibayo",
        "Lote","Malabia","Munting Batangas","Poblacion","Portero",
        "Puerto Rivas","San Jose","Sibacan","Talisay","Tanato","Tenejero","Tortugas","Tuyo",
    ]),
    "Dinalupihan": ("Bataan", [
        "Aquino","Bangal","Bayan-bayanan","Dampol","Gutad","Mabini",
        "Macabacle","Maligaya","Mapaniqui","Pag-asa","Pagalanggang",
        "Payangan","Pita","Poblacion","San Ramon","Sapang Balas","Torres",
    ]),
    "Hermosa": ("Bataan", [
        "A. Rivera","Bacong","Balsic","Bamban","Burgos","Daungan",
        "Mabiga","Mabuco","Maite","Mambog","Palihan","Pandatung",
        "Pulo","Saba","San Pedro","Taugtog","Tipo",
    ]),
    "Mariveles": ("Bataan", [
        "Alas-asin","Alion","Balon-Anito","Baseco","Batangas 2",
        "Cabcaben","Camaya","Cayangnan","Lamao","Lucanin","Malaya",
        "Maligaya","Poblacion","San Carlos","Sisiman","Townsite",
    ]),
    # ── Region 3 — Nueva Ecija ───────────────────────────────────────────────
    "Cabanatuan City": ("Nueva Ecija", [
        "Aduas Centro","Aduas Norte","Aduas Sur","Bagong Buhay","Bakero",
        "Bangad","Bitas","Campo Tinio","Communal","Cruz Roja","Daang Sarile",
        "Dicarma","Fatima","Kalikid Norte","Kalikid Sur","Kapitan Pepe",
        "Lagare","Lourdes","Magsaysay Norte","Magsaysay Sur","Matadero",
        "Pampuan","Poblacion","Rafael Rueda Sr.","Rizdelan","Sabit",
        "Sangitan","Santa Arcadia","Santo Niño","Sumacab Este",
        "Sumacab Norte","Valle Cruz","Villa Ofelia",
    ]),
    "Gapan City": ("Nueva Ecija", [
        "Bayanihan","Bulak","Kapalangan","Lagare","Licab","Mahipon",
        "Malimba","Maliwalo","Napnud","Pambuan","Pinagbayanan",
        "Poblacion Norte","Poblacion Sur","San Lorenzo","San Vicente",
        "Tagumpay","Tuburan",
    ]),
    # ── Region 3 — Tarlac ────────────────────────────────────────────────────
    "Tarlac City": ("Tarlac", [
        "Aguso","Amucao","Armenia","Asturias","Balete","Balibago Norte",
        "Balibago Sur","Balingcanaway","Banaba","Binauganan","Bora",
        "Buenavista","Capehan","Carangian","Central","Culipat",
        "Cut-cut Primero","Cut-cut Segundo","Dalayap","Dela Paz","Dolores",
        "Laoag","Ligtasan","Maliwalo","Mapalacsiao","Matatalaib",
        "Paraiso","Poblacion","San Carlos","San Francisco","San Isidro",
        "San Jose","San Miguel","Santa Cruz","Santa Lucia","Santa Maria",
        "Santo Niño 1st","Santo Niño 2nd","Santo Rosario","Victoria",
    ]),
    "Capas": ("Tarlac", [
        "Aranguren","Bueno","Florida","Kaito","Maruglu","O'Donnell",
        "Poblacion","San Antonio","San Jose","Sta. Juliana","Sta. Lucia","Sto. Domingo",
    ]),
    # ── Other key cities (lighter coverage) ──────────────────────────────────
    "Cebu City":     ("Cebu", ["Lahug","Mabolo","Banilad","Talamban","Pardo","Guadalupe","Basak San Nicolas","Talisay","Carbon","Colon"]),
    "Davao City":    ("Davao del Sur", ["Agdao","Buhangin","Bunawan","Calinan","Marilog","Paquibato","Poblacion","Talomo","Toril","Tugbok"]),
    "Iloilo City":   ("Iloilo", ["Jaro","La Paz","Mandurriao","Molo","Arevalo","City Proper","Lapuz","Oton"]),
    "Bacolod":       ("Negros Occidental", ["Alijis","Bata","Bugo","Estefania","Handumanan","Mansilingan","Pahanocoy","Singcang-Airport","Taculing","Vista Alegre"]),
    "Cagayan de Oro":("Misamis Oriental", ["Bulua","Canitoan","Carmen","Consolacion","Gusa","Iponan","Kauswagan","Macabalan","Nazareth","Puerto"]),
    "Bacoor":        ("Cavite", ["Alima","Aniban 1","Aniban 2","Banalo","Bayanan","Campo Santo","Daang Bukid","Digman","Dulong Bayan","Habay","Kaingin","Ligas","Mambog","Molino 1","Molino 2","Niog","Panapaan","Queen's Row","Real de Bacoor","Salinas","San Nicolas","Sineguelasan","Talaba","Zapote"]),
    "Dasmariñas":    ("Cavite", ["Burol 1","Burol 2","Burol 3","Datu Esmael","Emmanuel Bergado","Fatima 1","Fatima 3","Langkaan","Luzviminda","Paliparan","Sabang","Salawag","San Agustin","San Antonio","Sampaloc","Sanghaya","Victoria Reyes"]),
}

# Flat city list for backwards-compat pool references
PH_CITIES = list(_PH_GEO.keys())

PH_PROVINCES = sorted({v[0] for v in _PH_GEO.values()})

# Keywords that indicate Philippine locale context
_PH_KEYWORDS = (
    "philippine","philippines","phil","manila","cebu","davao","quezon city","makati",
    "metro manila","luzon","visayas","mindanao","batangas","laguna","pampanga",
    "bulacan","cavite","iloilo","bacolod","cagayan","negros","leyte","bicol",
    "zamboanga","cotabato","olongapo","subic","palawan","bohol","samar","marikina",
    "tarlac","nueva ecija","bataan","zambales","central luzon","region 3","ncr",
)


def _is_ph_locale(field_name: str, description: str) -> bool:
    hint = (field_name + " " + description).lower()
    return any(k in hint for k in _PH_KEYWORDS)


def _ph_address() -> str:
    """Generate a realistic Philippine address with matching city-barangay-province."""
    city = random.choice(PH_CITIES)
    province, barangays = _PH_GEO[city]
    brgy   = random.choice(barangays)
    street = random.choice(PH_STREETS)
    house  = random.randint(1, 999)
    return f"{house} {street}, Brgy. {brgy}, {city}, {province}"


DOMAINS = ["gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","proton.me"]

_POOLS: dict[str, list[str]] = {
    "country":     ["United States","Philippines","Canada","Germany","Japan","Australia","Brazil","India","France","United Kingdom","Mexico","South Korea","Italy","Spain","Netherlands"],
    "city":        ["New York","Los Angeles","Chicago","Houston","Manila","Tokyo","London","Paris","Sydney","Toronto","Berlin","Mumbai","São Paulo","Seoul","Madrid"],
    "city_from":   ["New York","Los Angeles","Chicago","Houston","Manila","Tokyo","London","Paris","Sydney","Toronto","Berlin","Mumbai","São Paulo","Seoul","Madrid"],
    "city_to":     ["New York","Los Angeles","Chicago","Houston","Manila","Tokyo","London","Paris","Sydney","Toronto","Berlin","Mumbai","São Paulo","Seoul","Madrid"],
    "state":       ["California","Texas","Florida","New York","Illinois","Pennsylvania","Ohio","Georgia","North Carolina","Michigan","Metro Manila","Cebu","Davao"],
    "province":    ["California","Texas","Florida","New York","Illinois","Pennsylvania","Ohio","Georgia","Metro Manila","Cebu","Davao","Laguna","Batangas"],
    "region":      ["North America","Europe","Asia Pacific","Latin America","Middle East","Africa","Southeast Asia","South Asia"],
    "department":  ["Engineering","Marketing","Sales","Human Resources","Finance","Operations","Product","Legal","Customer Support","Research & Development"],
    "dept":        ["Engineering","Marketing","Sales","Human Resources","Finance","Operations","Product","Legal","Customer Support","Research & Development"],
    "protocol":    ["TCP","UDP","HTTP","HTTPS","FTP","SSH","DNS","ICMP","SMTP","RDP","SMB","TLS"],
    "attack":      ["SQL Injection","XSS","DDoS","Phishing","Brute Force","Man-in-the-Middle","Ransomware","Zero-Day","Port Scan","Credential Stuffing"],
    "threat":      ["Malware","Ransomware","Phishing","Insider Threat","APT","DDoS","SQL Injection","Data Exfiltration","Credential Theft","Zero-Day Exploit"],
    "severity":    ["Low","Medium","High","Critical"],
    "level":       ["Low","Medium","High","Critical"],
    "priority":    ["Low","Medium","High","Urgent"],
    "status":      ["Active","Inactive","Pending","Completed","Cancelled","In Progress","On Hold","Resolved"],
    "stage":       ["Draft","Review","Approved","Published","Archived","In Progress","Completed"],
    "grade":       ["A","A","A","A","B","B","B","B","B","B","C","C","C","C","C","D","D","D","F","F"],
    "category":    ["Laptops","Desktop PCs","Monitors","Keyboards & Mice","Storage Devices","RAM & Memory","CPUs & Processors","Graphics Cards","Motherboards","Networking","Power Supplies","Cooling Systems","Printers","Scanners","UPS & Power","Accessories","Software Licenses","Peripherals","Cables & Adapters","Gaming Gear"],
    "product_category":["Laptops","Desktop PCs","Monitors","Input Devices","Storage","Memory","Processors","Graphics Cards","Motherboards","Networking","Power Supplies","Cooling","Printers","UPS","Peripherals","Accessories"],
    "type":        ["Type A","Type B","Type C","Type D"],
    "gender":      ["Male","Female","Non-binary","Prefer not to say"],
    "sex":         ["Male","Female"],
    "marital":     ["Single","Married","Divorced","Widowed"],
    "platform":    ["Windows","macOS","Linux","Android","iOS","Ubuntu","CentOS"],
    "os":          ["Windows 11","Windows 10","macOS Ventura","Ubuntu 22.04","Android 14","iOS 17","CentOS 8"],
    "browser":     ["Chrome","Firefox","Safari","Edge","Opera","Brave"],
    "device":      ["Desktop","Laptop","Smartphone","Tablet","Server","IoT Device"],
    "diagnosis":   ["Hypertension","Diabetes Type 2","Asthma","Pneumonia","COVID-19","Appendicitis","Migraine","Anxiety Disorder","Fracture","Anemia"],
    "condition":   ["Stable","Critical","Improving","Deteriorating","Under Observation"],
    "disease":     ["Hypertension","Diabetes","Asthma","Tuberculosis","COVID-19","Dengue","Malaria","Cancer","Heart Disease","Stroke"],
    "treatment":   ["Surgery","Chemotherapy","Physical Therapy","Medication","Observation","Dialysis","Radiation","Immunotherapy","Vaccination","Rest"],
    "medication":  ["Paracetamol","Amoxicillin","Ibuprofen","Metformin","Lisinopril","Atorvastatin","Omeprazole","Amlodipine","Azithromycin","Prednisone"],
    "occupation":  ["Engineer","Doctor","Teacher","Nurse","Accountant","Lawyer","Developer","Designer","Manager","Analyst"],
    "job":         ["Engineer","Doctor","Teacher","Nurse","Accountant","Lawyer","Developer","Designer","Manager","Analyst"],
    "role":        ["Admin","User","Manager","Analyst","Developer","Designer","Viewer","Editor","Owner","Guest"],
    "airline":     ["Philippine Airlines","Cebu Pacific","AirAsia","Delta","United","American Airlines","Emirates","Singapore Airlines","Cathay Pacific","Qatar Airways"],
    "airport":     ["NAIA","Mactan-Cebu","Clark","Los Angeles (LAX)","New York (JFK)","London (LHR)","Tokyo (NRT)","Sydney (SYD)","Dubai (DXB)","Singapore (SIN)"],
    "product":     ["Laptop","Desktop PC","Monitor","Mechanical Keyboard","Gaming Mouse","Webcam","Headset","USB Hub","SSD Drive","RAM 16GB","RAM 32GB","CPU Cooler","Power Supply","Graphics Card","Motherboard","Wireless Router","Network Switch","UPS Battery","Inkjet Printer","Laser Printer"],
    "plan":        ["Free","Basic","Pro","Enterprise","Starter","Business","Ultimate"],
    "currency":    ["USD","EUR","GBP","JPY","PHP","AUD","CAD","SGD","CNY","KRW"],
    "language":    ["English","Spanish","French","German","Japanese","Mandarin","Filipino","Portuguese","Arabic","Korean"],
    "color":       ["Red","Blue","Green","Yellow","Orange","Purple","Black","White","Gray","Brown"],
    "size":        ["XS","S","M","L","XL","XXL"],
    "education":   ["High School","Bachelor's Degree","Master's Degree","PhD","Associate Degree","Vocational","Some College"],
    "degree":      ["High School","Bachelor's","Master's","PhD","Associate","Vocational","Doctor of Medicine","Juris Doctor","MBA","MSc","MA"],
    "action":      ["Login","Logout","Create","Update","Delete","View","Download","Upload","Share","Export"],
    "event":       ["Login","Logout","Purchase","Signup","Click","View","Download","Error","Warning","Info"],
    "log":         ["INFO: Request processed","WARNING: High memory usage","ERROR: Connection timeout","DEBUG: Query executed","INFO: User authenticated","ERROR: Invalid token"],
    "note":        ["Follow up required","No issues found","Escalated to manager","Resolved successfully","Awaiting customer response","Under review","Completed as requested"],
    "comment":     ["Looks good","Needs revision","Approved","Rejected","Under review","Please clarify","Well done","Requires more detail"],
    "remark":      ["Satisfactory","Needs improvement","Excellent","Good","Average","Below average","Outstanding","Meets expectations"],
    "feedback":    ["Very satisfied","Satisfied","Neutral","Dissatisfied","Very dissatisfied","Great service","Could be better","Excellent experience"],
    "description": ["Standard configuration","Custom setup","Default settings","Advanced configuration","Minimal setup","Full installation","Partial deployment"],
    "tag":         ["urgent","important","low-priority","follow-up","escalated","new","resolved","archived","flagged","reviewed"],
    "label":       ["urgent","important","low-priority","follow-up","escalated","new","resolved","archived","flagged","reviewed"],
    "nationality": ["American","Filipino","Canadian","German","Japanese","Australian","Brazilian","Indian","French","British","Mexican","Korean","Italian","Spanish","Dutch","Singaporean","Thai","Indonesian","Vietnamese","Chinese"],
    "citizenship": ["American","Filipino","Canadian","German","Japanese","Australian","Brazilian","Indian","French","British","Mexican","Korean","Italian","Spanish","Dutch","Singaporean","Thai","Indonesian"],
    "ethnicity":   ["Asian","White","Hispanic","Black","Mixed","Pacific Islander","Middle Eastern","Native American","South Asian","Southeast Asian"],
    "blood":       ["A+","A-","B+","B-","AB+","AB-","O+","O-"],
    "company":     ["Google","Apple","Microsoft","Amazon","Meta","Netflix","Tesla","Samsung","IBM","Intel","Oracle","Adobe","Salesforce","Shopify","Uber","Airbnb","Spotify","Grab","Lazada","SM Group","Ayala Corporation","BDO Unibank","PLDT","Meralco","Jollibee","Globe Telecom","Ayala Land","BPI","Metrobank"],
    "organization":["United Nations","World Health Organization","Red Cross","UNICEF","Amnesty International","Greenpeace","World Bank","IMF","ASEAN","APEC","NATO","WHO","UNESCO","UNDP","ILO"],
    "employer":    ["Google","Apple","Microsoft","Amazon","Meta","Netflix","Tesla","Samsung","IBM","Intel","Oracle","Adobe","Salesforce","Shopify","Uber","Jollibee","Globe","PLDT","SM Group","Ayala"],
    "brand":       ["Nike","Adidas","Apple","Samsung","Toyota","Honda","Sony","LG","Uniqlo","H&M","Zara","Louis Vuitton","Gucci","Prada","Chanel","Rolex","Nestlé","Coca-Cola","Pepsi","McDonald's"],
    "job_title":   ["Software Engineer","Product Manager","Data Analyst","UX Designer","Marketing Manager","HR Specialist","Financial Analyst","Operations Manager","Sales Representative","IT Specialist","Customer Service Representative","Business Analyst","Project Manager","QA Engineer","DevOps Engineer","Full Stack Developer","Data Scientist","Content Writer","Graphic Designer","Accountant"],
    "position":    ["Software Engineer","Product Manager","Data Analyst","UX Designer","Marketing Manager","HR Specialist","Financial Analyst","Operations Manager","Sales Representative","IT Specialist","Business Analyst","Project Manager","Team Lead","Senior Associate","Director","VP","Associate","Intern","Senior Engineer","Lead Developer"],
    "designation": ["Software Engineer","Product Manager","Data Analyst","Marketing Manager","HR Specialist","Operations Manager","Sales Representative","IT Specialist","Business Analyst","Project Manager","Team Lead","Director","VP","Associate","Senior Engineer","Intern","Consultant","Specialist","Coordinator","Supervisor"],
    "university":  ["University of the Philippines","De La Salle University","Ateneo de Manila University","University of Santo Tomas","Far Eastern University","Polytechnic University of the Philippines","National University","Mapua University","Harvard University","MIT","Stanford University","Oxford University","Cambridge University","UC Berkeley","Yale University"],
    "college":     ["University of the Philippines","De La Salle University","Ateneo de Manila University","University of Santo Tomas","Far Eastern University","Polytechnic University of the Philippines","National University","Mapua University","Harvard University","MIT","Stanford University","Oxford University"],
    "school":      ["UP High School","Ateneo de Manila","La Salle Greenhills","Xavier School","Assumption College","Miriam College","San Beda","Adamson University","Mapua University","National University","Harvard University","Oxford University","MIT"],
    "institution": ["University of the Philippines","De La Salle University","Ateneo de Manila University","University of Santo Tomas","National University","Mapua University","Harvard University","MIT","Stanford University","Oxford University","Cambridge University"],
    "course":      ["Computer Science","Business Administration","Nursing","Information Technology","Electronics Engineering","Civil Engineering","Accountancy","Psychology","Architecture","Medicine","Law","Tourism","Communication","Marketing","Finance","Education","Biology","Chemistry","Physics","Mathematics"],
    "subject":     ["Mathematics","English","Science","History","Geography","Physics","Chemistry","Biology","Computer Science","Physical Education","Art","Music","Social Studies","Philosophy","Economics","Literature","Filipino","Statistics","Trigonometry","Calculus"],
    "major":       ["Computer Science","Business Administration","Nursing","Information Technology","Engineering","Education","Accountancy","Psychology","Architecture","Liberal Arts","Fine Arts","Mathematics","Biology","Chemistry","Physics","Communication","Marketing","Finance","Law","Medicine"],
    "year_level":  ["Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","1st Year","2nd Year","3rd Year","4th Year","5th Year","Graduate"],
    "product_name":["Acer Aspire 5 Laptop","ASUS ROG Gaming PC","Dell 27\" 4K Monitor","Logitech MX Keys","Razer DeathAdder V3","Seagate Barracuda 2TB HDD","Samsung 970 EVO 1TB SSD","Corsair Vengeance 32GB RAM","NVIDIA RTX 4070","Intel Core i7-13700K","AMD Ryzen 9 7900X","ASUS ROG STRIX B650-E","Corsair RM850x PSU","be quiet! Dark Rock 4","Netgear Nighthawk AX6000","TP-Link TL-SG108","APC Back-UPS 1500VA","HP LaserJet Pro M404n","Canon PIXMA G3020","Epson L3210 Printer"],
    "item_name":   ["Laptop","Desktop PC","Monitor","Keyboard","Mouse","Webcam","Headset","USB Hub","External SSD","RAM Module","CPU","Power Supply","Graphics Card","Network Card","Router","Switch","UPS","Printer","Scanner","Projector"],
    "item":        ["Laptop","Desktop PC","Monitor","Keyboard","Mouse","Headset","Webcam","USB Hub","SSD Drive","RAM","CPU","PSU","GPU","Motherboard","Router","Switch","Printer","Scanner","UPS","Projector"],
    "supplier_name":["PC Express Philippines","Datablitz","iTech Philippines","Villman Computers","Abenson Enterprises","CDW Technology","Arrow Electronics","Ingram Micro","TD SYNNEX","Tech Data Philippines","Samsung Electronics PH","ASUS Philippines","Logitech Philippines","Seagate Technology","Kingston Technology","Corsair Philippines","HP Philippines","Canon Philippines","Epson Philippines","Acer Philippines"],
    "vendor_name":  ["PC Express Philippines","Datablitz","iTech Philippines","Villman Computers","CDW Technology","Arrow Electronics","Ingram Micro","TD SYNNEX","Samsung Electronics","ASUS","Logitech","Seagate","Kingston","Corsair","HP Philippines","Canon Philippines","Epson","Acer","MSI","Gigabyte"],
    "manufacturer": ["ASUS","MSI","Gigabyte","Acer","Dell","HP","Lenovo","Samsung","LG","BenQ","Logitech","Razer","Corsair","Kingston","Seagate","Western Digital","Intel","AMD","NVIDIA","Canon"],
    "brand_name":   ["ASUS","MSI","Gigabyte","Acer","Dell","HP","Lenovo","Samsung","Logitech","Razer","Corsair","Kingston","Seagate","Intel","AMD","NVIDIA","Canon","Epson","TP-Link","Netgear"],
    # ── Domain-specific product pools (checked before generic product_name) ───
    "grocery_product":["White Rice 5kg","Premium Jasmine Rice 5kg","Brown Rice 2kg","Fresh Whole Milk 1L","Low-Fat Milk 1L","Chocolate Milk 250ml","Sliced White Bread","Whole Wheat Bread","Pandesal 12 pcs","Free-Range Eggs 12 pcs","Brown Eggs 6 pcs","Fresh Chicken Breast 500g","Chicken Whole 1kg","Ground Pork 500g","Pork Belly 500g","Atlantic Salmon 500g","Tilapia 1kg","Fresh Tomatoes 500g","Red Onions 1kg","White Onions 500g","Garlic 250g","Potatoes 1kg","Bananas 1 bunch","Mangoes 1kg","Apples 1kg","Pineapple 1 pc","Cooking Oil 1L","Soy Sauce 350ml","Fish Sauce 350ml","Vinegar 350ml","Instant Noodles Lucky Me","Canned Sardines Tomato Sauce","Corned Beef 260g","Spam Classic 340g","Condensed Milk 300ml","Coffee 3-in-1 10 sachets","Orange Juice 1L","Mineral Water 1.5L","Dishwashing Liquid 500ml","Laundry Detergent 1kg","Fabric Conditioner 500ml","Toilet Paper 12 rolls","Shampoo 200ml","Bath Soap 3-pack"],
    "clothing_product":["Men's Crew-Neck T-Shirt","Women's V-Neck Blouse","Unisex Polo Shirt","Slim-Fit Denim Jeans Men","High-Waist Skinny Jeans Women","Cargo Pants","Summer Floral Dress","Maxi Skirt","A-Line Skirt","Men's Formal Button-Down Shirt","Women's Blazer","Zip-Up Hoodie","Athletic Running Shorts","Yoga Leggings","Sports Bra","Leather Oxford Shoes","Casual Sneakers Unisex","Women's High Heels","Wool Knit Sweater","Down Jacket","Windbreaker","Baseball Cap","Beanie Hat","Canvas Tote Bag","Boxer Briefs 3-pack","Women's Cotton Underwear 3-pack","Ankle Socks 6-pack","School Uniform Top","School Uniform Pants","Swim Boardshorts","One-Piece Swimsuit","Denim Jacket","Trench Coat","Leather Belt","Silk Scarf"],
    "medical_product":["Paracetamol 500mg 20 tabs","Paracetamol Syrup 250mg/5ml","Amoxicillin 500mg Capsules 10s","Amoxicillin 250mg/5ml Suspension","Ibuprofen 400mg 10 tabs","Mefenamic Acid 500mg 10 tabs","Cetirizine 10mg 10 tabs","Loratadine 10mg 10 tabs","Omeprazole 20mg Capsules 14s","Antacid Tablets 24s","Oral Rehydration Salts 6 sachets","Multivitamins 30 tabs","Vitamin C 500mg 30 tabs","Vitamin B-Complex 30 tabs","Povidone-Iodine Solution 120ml","70% Isopropyl Alcohol 500ml","Sterile Gauze Pads 10s","Adhesive Bandages 10s","Disposable Surgical Gloves 100 pairs","N95 Respirator Masks 10s","Digital Thermometer","Blood Pressure Monitor","Pulse Oximeter","Glucometer Starter Kit","Saline Solution 500ml","Nasal Saline Spray 100ml","Eye Drops 10ml","Metformin 500mg 30 tabs","Amlodipine 5mg 30 tabs","Atorvastatin 20mg 30 tabs"],
    "furniture_product":["Ergonomic Mesh Office Chair","High-Back Executive Chair","Stackable Plastic Chair","Height-Adjustable Standing Desk","L-Shaped Computer Desk","Study Writing Desk","3-Seater Fabric Sofa","2-Seater Loveseat","Recliner Armchair","Queen-Size Bed Frame","Single Bed with Storage","Double Bed Frame","6-Door Wardrobe Closet","Bedside Table with Drawer","Chest of Drawers","5-Shelf Bookcase","2-Door Filing Cabinet","Corner Shelf Unit","8-Seater Dining Table Set","4-Seater Round Table","Bar Stool Set of 2","Glass Coffee Table","Wooden Side Table","TV Entertainment Stand","Wall-Mounted Floating Shelf","Outdoor Garden Bench","Foldable Camping Chair","Bean Bag Chair","Kids Study Desk","Shoe Rack 4-Tier"],
    "food_product":     ["Spaghetti Carbonara","Penne Arrabbiata","Lasagna al Forno","Beef Burger with Fries","Chicken Club Sandwich","BLT Sandwich","Pepperoni Pizza 12 inch","Margherita Pizza 12 inch","Hawaiian Pizza 12 inch","Caesar Salad","Greek Salad","Garden Salad","Chicken Adobo with Rice","Beef Sinigang","Pork Kare-Kare","Cream of Mushroom Soup","Tom Yum Soup","French Onion Soup","Grilled Salmon with Vegetables","Chicken Teriyaki","Beef Stir-Fry","Chocolate Lava Cake","Tiramisu","Crème Brûlée","Iced Caramel Latte","Americano","Matcha Latte","Mango Shake","Lemon Iced Tea","Fresh Buko Juice","Garlic Bread 6 pcs","Onion Rings","Potato Wedges","Crispy Fried Chicken","Fish and Chips"],
    "book_title":       ["The Alchemist — Paulo Coelho","Atomic Habits — James Clear","Rich Dad Poor Dad — Robert Kiyosaki","The 7 Habits of Highly Effective People — Covey","Thinking Fast and Slow — Daniel Kahneman","Deep Work — Cal Newport","Zero to One — Peter Thiel","The Lean Startup — Eric Ries","Sapiens — Yuval Noah Harari","Educated — Tara Westover","The Great Gatsby — F. Scott Fitzgerald","To Kill a Mockingbird — Harper Lee","1984 — George Orwell","Brave New World — Aldous Huxley","Harry Potter and the Sorcerer's Stone","The Hobbit — J.R.R. Tolkien","The Da Vinci Code — Dan Brown","Gone Girl — Gillian Flynn","The Hunger Games — Suzanne Collins","Dune — Frank Herbert","Noli Me Tangere — Jose Rizal","El Filibusterismo — Jose Rizal","Florante at Laura — Francisco Balagtas","Ibong Adarna — Anonymous","Philippine History — Gregorio Zaide"],
    "game_title":       ["Minecraft","Grand Theft Auto V","Red Dead Redemption 2","The Legend of Zelda: Breath of the Wild","Elden Ring","God of War Ragnarök","Cyberpunk 2077","Baldur's Gate 3","The Witcher 3: Wild Hunt","Dark Souls III","Call of Duty: Modern Warfare","Apex Legends","Valorant","League of Legends","Dota 2","Mobile Legends: Bang Bang","PUBG Mobile","Honor of Kings","Genshin Impact","Roblox","Among Us","Stardew Valley","Terraria","Counter-Strike 2","FIFA 24","NBA 2K24","Overwatch 2","Fortnite","Diablo IV","Street Fighter 6"],
    "hardware_product": ["20V Cordless Drill Driver","Angle Grinder 4.5 inch","Circular Saw 7.25 inch","Orbital Sander","Jigsaw with Guide","Bench Vise 4 inch","Combination Wrench Set 12 pcs","Ratchet Socket Set 40 pcs","Screwdriver Set 6 pcs","Claw Hammer 16oz","Measuring Tape 5m","Spirit Level 24 inch","Utility Knife with Blades","Hacksaw Frame","Pliers Set 3 pcs","Wire Stripper","Soldering Iron 60W","Multimeter Digital","Extension Cord 5m 3-socket","PVC Pipe 1 inch 3m","Electrical Tape Roll","Paint Roller Set","Masonry Drill Bit Set","Safety Goggles","Work Gloves Leather"],
    "cosmetics_product":["Maybelline Fit Me Foundation","L'Oréal Revitalift Moisturizer","Neutrogena Sunscreen SPF50","MAC Ruby Woo Lipstick","Nyx Butter Gloss","Benefit Precisely My Brow Pencil","Urban Decay Eyeshadow Palette","Cetaphil Gentle Cleanser","The Ordinary Hyaluronic Acid Serum","Vitamin C Brightening Serum","Micellar Water 400ml","Toner Pads 60 pcs","Sheet Mask Pack 10s","Eye Cream 15ml","BB Cream SPF30","Contour Palette","Setting Powder","Mascara Volumizing","Eyeliner Felt-Tip","Blush On Peach Nude","Highlighter Champagne","Makeup Brush Set 12 pcs","Makeup Remover Wipes 25s","Rose Water Toner 150ml","Aloe Vera Gel 200ml"],
    "sports_product":   ["Nike Air Max Running Shoes","Adidas Ultraboost 22","Yoga Mat 6mm Non-slip","Adjustable Dumbbell Set 20kg","Pull-Up Bar Doorframe","Resistance Bands Set 5-pack","Jump Rope Speed","Boxing Gloves 12oz","Basketball Spalding Official","Football Size 5 Adidas","Tennis Racket Wilson","Badminton Racket Set","Swimming Goggles Anti-fog","Cycling Helmet","Water Bottle BPA-free 750ml","Gym Bag Duffel 40L","Compression Leggings","Sports Towel Quick-dry","Foam Roller 45cm","Whey Protein Powder 1kg","Treadmill Folding","Stationary Bike","Kettlebell 16kg","Bench Press Bar Set","Ab Roller Wheel"],
    "automotive_product":["All-Season Tires 185/65R15","Ceramic Brake Pads Front Set","Engine Oil SAE 5W-30 4L","Oil Filter Standard","Air Filter Engine","Cabin Air Filter","Spark Plugs Set 4 pcs","Wiper Blades 20+18 inch","Car Battery 60Ah MF","Jump Starter Portable","Tire Inflator 12V","Car Vacuum Cleaner","Dashboard Camera 1080p","GPS Navigator 7 inch","Seat Covers Full Set","Car Wax Polish 300g","Microfiber Cloth 5-pack","Coolant/Antifreeze 1L","Power Steering Fluid 500ml","Brake Fluid DOT 4 500ml","Fuel Injector Cleaner","Car Phone Holder Magnetic","Reverse Parking Sensor Kit","LED Headlight Bulbs H4","USB Car Charger Dual Port"],
    "movement_type":["Purchase","Sale","Return","Damaged","Transfer In","Transfer Out","Adjustment","Stock Count","Disposal","Write-off"],
    "stock_movement":["Purchase","Sale","Return","Damaged","Transfer","Adjustment","Stock Count"],
    "transaction_type_inv":["Purchase Order","Sales Invoice","Customer Return","Supplier Return","Stock Transfer","Inventory Adjustment","Damaged Goods Write-off"],
    "warehouse_name":["Main Warehouse","Branch Store 1","Branch Store 2","Storage Room A","Online Fulfillment Center","Service Center"],
    "warehouse":    ["Main Warehouse","Branch Store 1","Branch Store 2","Storage Room A","Online Fulfillment Center"],
    "location_name":["Main Warehouse","Branch Store 1","Branch Store 2","Storage Room A","Service Center","Head Office"],
    "service":     ["Cloud Hosting","Technical Support","Consulting","Training","Maintenance","Installation","Delivery","Subscription","Premium Access","API Access","Data Storage","Email Service","VPN Service","Security Audit","Software License"],
    "payment_method":["Credit Card","Debit Card","PayPal","GCash","Maya","Bank Transfer","Cash","Cryptocurrency","Check","Installment"],
    "payment":     ["Credit Card","Debit Card","PayPal","GCash","Maya","Bank Transfer","Cash","Cryptocurrency","Check","Installment"],
    "shipping":    ["Standard","Express","Overnight","Same-Day","Free Shipping","Economy","Priority","Tracked","Untracked","International"],
    "ward":        ["ICU","Emergency","Pediatrics","Cardiology","Oncology","Neurology","Orthopedics","Maternity","Geriatrics","Psychiatry","General"],
    "hospital":    ["Philippine General Hospital","St. Luke's Medical Center","Makati Medical Center","The Medical City","Asian Hospital","National Kidney Institute","Cardinal Santos Medical Center","Ospital ng Maynila","University of Santo Tomas Hospital","St. Elizabeth Hospital"],
    "specialist":  ["Cardiologist","Neurologist","Oncologist","Pediatrician","Orthopedic Surgeon","Dermatologist","Psychiatrist","Radiologist","Endocrinologist","Gastroenterologist","General Practitioner","Ophthalmologist","ENT Specialist","Pulmonologist","Rheumatologist"],
    "symptom":     ["Fever","Cough","Headache","Fatigue","Shortness of breath","Nausea","Chest pain","Dizziness","Back pain","Joint pain","Sore throat","Rash","Vomiting","Diarrhea","Loss of appetite"],
    "barangay":    ["Barangay 1","Barangay 2","Barangay 3","Barangay 4","Barangay 5","Barangay 6","Barangay 7","Barangay 8","Barangay 9","Barangay 10","Barangay 11","Barangay 12","Barangay 13","Barangay 14","Barangay 15","Barangay 16","Barangay 17","Barretto","East Bajac-Bajac","West Bajac-Bajac","East Tapinac","West Tapinac","Gordon Heights","Kalaklan","Mabayuan","New Cabalan","Old Cabalan","Pag-asa","Sta. Rita"],
    "brgy":        ["Barangay 1","Barangay 2","Barangay 3","Barangay 4","Barangay 5","Barangay 6","Barangay 7","Barangay 8","Barangay 9","Barangay 10","Barangay 11","Barangay 12","Barangay 13","Barangay 14","Barangay 15","Barangay 16","Barangay 17","Barretto","East Bajac-Bajac","West Bajac-Bajac","East Tapinac","West Tapinac","Gordon Heights","Kalaklan","Mabayuan","New Cabalan","Old Cabalan","Pag-asa","Sta. Rita"],
    "municipality":["Olongapo","Subic","San Antonio","San Narciso","Castillejos","San Felipe","Santa Cruz","Palauig","Candelaria","Masinloc","Iba","San Marcelino","Cabangan","San Antonio","Botolan"],
    "district":    ["District 1","District 2","District 3","District 4","District 5","Northern District","Southern District","Eastern District","Western District","Central District"],
    "ph_region":   ["NCR","Region I","Region II","Region III","Region IV-A","Region IV-B","Region V","Region VI","Region VII","Region VIII","Region IX","Region X","Region XI","Region XII","CARAGA","CAR","BARMM"],
    "ph_province": ["Metro Manila","Cebu","Davao del Sur","Laguna","Batangas","Pampanga","Bulacan","Cavite","Rizal","Pangasinan","Zambales","Nueva Ecija","Iloilo","Negros Occidental","Leyte","Quezon","Camarines Sur","Albay","Isabela","Cagayan"],
    "day_of_week": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    "weekday":     ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    "month_name":  ["January","February","March","April","May","June","July","August","September","October","November","December"],
    "quarter":     ["Q1","Q2","Q3","Q4","1st Quarter","2nd Quarter","3rd Quarter","4th Quarter"],
    "shift":       ["Morning Shift","Afternoon Shift","Night Shift","Graveyard Shift","Day Shift"],
    "time_slot":   ["8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM"],
    "class_start_time": ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","17:00"],
    "class_end_time":   ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","14:00","14:30","15:00","15:30","16:00","17:00","18:00","19:00","20:00"],
    "start_time":       ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","17:00"],
    "end_time":         ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","14:00","14:30","15:00","15:30","16:00","17:00","18:00","19:00","20:00"],
    "schedule":    ["Daily","Weekly","Bi-weekly","Monthly","Quarterly","Annually","On-demand","Flexible","Fixed"],
    "frequency":   ["Daily","Weekly","Bi-weekly","Monthly","Quarterly","Annually","One-time","Recurring"],
    "semester":    ["1st Semester","2nd Semester","Summer Term"],
    "school_year": ["2020-2021","2021-2022","2022-2023","2023-2024","2024-2025","2025-2026"],
    "term":        ["1st Semester","2nd Semester","Summer Term","1st Quarter","2nd Quarter","3rd Quarter","4th Quarter"],
    "civil_status":["Single","Married","Widowed","Separated","Annulled","Live-in"],
    "relationship":["Single","Married","Widowed","Separated","Annulled","Divorced","In a Relationship"],
    "religion":    ["Roman Catholic","Islam","Iglesia ni Cristo","Protestant","Seventh-day Adventist","Buddhism","Jehovah's Witness","Evangelical","Pentecostal","Atheist / Agnostic","Other"],
    "suffix":      ["Jr.","Sr.","II","III","IV","N/A"],
    "honorific":   ["Mr.","Ms.","Mrs.","Dr.","Engr.","Atty.","Prof.","Rev."],
    "salutation":  ["Mr.","Ms.","Mrs.","Dr.","Engr.","Atty.","Prof."],
    "strand":      ["STEM","ABM","HUMSS","GAS","TVL – Industrial Arts","TVL – Home Economics","TVL – ICT","TVL – Agriculture","Sports Track","Arts and Design Track"],
    "track":       ["Academic Track","Technical-Vocational-Livelihood Track","Sports Track","Arts and Design Track"],
    "section":     ["Section A","Section B","Section C","Section D","Section E","Section F","Section G","Section H"],
    "grading_period":["1st Grading","2nd Grading","3rd Grading","4th Grading","1st Quarter","2nd Quarter","3rd Quarter","4th Quarter"],
    "learning_mode":["Face-to-Face","Online","Modular","Blended","Homeschool"],
    "result":      ["Passed","Failed","Incomplete","Pending","Under Review","Conditionally Passed"],
    "outcome":     ["Successful","Failed","Pending","Completed","Cancelled","In Progress","On Hold"],
    "verdict":     ["Approved","Rejected","Pending","Under Review","Conditionally Approved","Deferred"],
    "decision":    ["Approved","Rejected","Pending","Under Review","Escalated","Deferred"],
    "pass_fail":   ["Pass","Fail"],
    "approval":    ["Approved","Rejected","Pending","Under Review","Conditionally Approved"],
    "purpose":     ["Personal","Business","Education","Research","Recreation","Emergency","Medical","Travel","Shopping","Government"],
    "reason":      ["Personal","Business","Academic","Medical","Travel","Shopping","Recreation","Emergency","Voluntary","Involuntary"],
    "cause":       ["Natural Causes","Accident","Illness","Unknown","Under Investigation","Negligence"],
    "mode":        ["Online","Walk-in","Phone","Email","In-person","Remote","Hybrid"],
    "method":      ["Online","Cash","Bank Transfer","Credit Card","Debit Card","GCash","Maya","Check","Installment","COD"],
    "channel":     ["Website","Mobile App","Social Media","Email","SMS","Phone Call","In-Store","Partner","Referral"],
    "source":      ["Website","Social Media","Referral","Email","Walk-in","Advertisement","Search Engine","Word of Mouth","Partner","Agent"],
    "transport":   ["Car","Bus","Jeepney","Tricycle","Motorcycle","Train (MRT/LRT)","Plane","Ship","Bicycle","UV Express","P2P Bus"],
    "vehicle":     ["Sedan","SUV","Truck","Van","Motorcycle","Bus","Jeepney","Tricycle","Bicycle","Electric Vehicle"],
    "access_level":["Full Access","Read Only","Write Only","Admin","Restricted","Guest","Public","Private"],
    "account_type":["Admin","Regular User","Premium","Guest","Staff","Moderator","Subscriber","Visitor"],
    "membership":  ["Free","Basic","Standard","Premium","VIP","Gold","Silver","Platinum","Trial"],
    "subscription":["Free","Monthly","Quarterly","Annual","Lifetime","Trial","Enterprise"],
    "tier":        ["Bronze","Silver","Gold","Platinum","Diamond","Free","Basic","Pro"],
    "order_status":["Pending","Confirmed","Processing","Shipped","Out for Delivery","Delivered","Cancelled","Returned","Refunded"],
    "delivery_status":["Pending","Dispatched","In Transit","Out for Delivery","Delivered","Failed","Returned"],
    "tracking":    ["Pending","In Transit","Out for Delivery","Delivered","Exception","Returned to Sender"],
    "return_reason":["Defective","Wrong Item","Changed Mind","Not as Described","Duplicate Order","Other"],
    "format":      ["PDF","Excel (.xlsx)","CSV","Word (.docx)","JSON","XML","PNG","JPEG","MP4","ZIP","TXT","PowerPoint (.pptx)"],
    "file_type":   ["Document","Spreadsheet","Image","Video","Audio","Archive","Database","Executable","Text","Presentation"],
    "extension":   [".pdf",".xlsx",".csv",".docx",".json",".xml",".png",".jpg",".mp4",".zip",".txt",".pptx"],
    "resolution":  ["1080p","720p","4K","480p","1440p","360p","2160p"],
    "transaction_type":["Purchase","Sale","Return","Transfer","Adjustment","Damaged","Restock","Write-off","Credit","Debit","Deposit","Payment","Refund"],
    "transaction": ["Purchase","Sale","Return","Transfer","Adjustment","Restock","Credit","Debit","Deposit","Payment","Refund"],
    "invoice_status":["Paid","Unpaid","Overdue","Partially Paid","Cancelled","Draft","Sent"],
    "contract_type":["Full-time","Part-time","Contractual","Project-based","Probationary","Consultancy","Internship"],
    "employment":  ["Full-time","Part-time","Contractual","Project-based","Probationary","Consultancy","Internship","Casual"],
    "position_level":["Entry Level","Junior","Mid-level","Senior","Lead","Manager","Director","VP","C-Level","Intern"],
    "occasion":    ["Birthday","Wedding","Anniversary","Christmas","New Year","Valentine's Day","Graduation","Baptism","Reunion","Fiesta","Halloween","Thanksgiving","Easter","Mother's Day","Father's Day"],
    "event_type":  ["Conference","Seminar","Workshop","Webinar","Training","Meeting","Party","Wedding","Birthday","Graduation","Exhibition","Festival"],
    "holiday":     ["New Year's Day","Valentine's Day","Holy Week","Labor Day","Independence Day","Bonifacio Day","Christmas Day","Rizal Day","All Saints' Day","Eid al-Fitr","Eid al-Adha"],
    "satisfaction":["Very Satisfied","Satisfied","Neutral","Dissatisfied","Very Dissatisfied"],
    "rating_label":["Poor","Fair","Good","Very Good","Excellent"],
    "recommendation":["Highly Recommended","Recommended","Neutral","Not Recommended","Would Not Recommend"],
    "log_level":   ["INFO","DEBUG","WARNING","ERROR","CRITICAL","FATAL","TRACE"],
    "environment": ["Development","Staging","Production","Testing","QA","Pre-production","Sandbox"],
    "http_method": ["GET","POST","PUT","DELETE","PATCH","HEAD","OPTIONS"],
    "error_code":  ["200","201","400","401","403","404","422","500","502","503"],
    "vulnerability":["SQL Injection","Cross-Site Scripting (XSS)","Cross-Site Request Forgery (CSRF)","Buffer Overflow","Remote Code Execution","Privilege Escalation","Directory Traversal","XML Injection","Command Injection","Insecure Deserialization","Broken Authentication","Sensitive Data Exposure","Security Misconfiguration","Zero-Day Exploit","Unpatched Software","Weak Password Policy","Man-in-the-Middle","Insecure API","Outdated Dependencies","Insufficient Logging"],
    "vulnerability_type":["SQL Injection","Cross-Site Scripting (XSS)","Buffer Overflow","Remote Code Execution","Privilege Escalation","Directory Traversal","Command Injection","Insecure Deserialization","Broken Authentication","Zero-Day Exploit","Security Misconfiguration","Weak Password Policy","Insecure API","CSRF","Outdated Dependencies"],
    "security_vulnerability":["SQL Injection","XSS","CSRF","Buffer Overflow","Remote Code Execution","Privilege Escalation","Directory Traversal","Command Injection","Insecure Deserialization","Broken Authentication","Zero-Day Exploit","Security Misconfiguration","Weak Password","Insecure Direct Object Reference","Unvalidated Redirects"],
    "defense":     ["Firewall","Intrusion Detection System (IDS)","Intrusion Prevention System (IPS)","Multi-Factor Authentication","Encryption","Patch Management","Security Awareness Training","Web Application Firewall (WAF)","VPN","Endpoint Protection","Zero Trust Architecture","Network Segmentation","Security Information and Event Management (SIEM)","Honeypot","Regular Backup"],
    "defense_mechanism":["Firewall","IDS/IPS","Multi-Factor Authentication","Encryption","WAF","Patch Management","Security Training","VPN","Endpoint Protection","Zero Trust","Network Segmentation","SIEM","Data Loss Prevention","Honeypot","Access Control"],
    "mechanism":   ["Firewall","IDS/IPS","Multi-Factor Authentication","Encryption","WAF","Patch Management","VPN","Endpoint Protection","SIEM","Data Loss Prevention","Access Control","Network Segmentation","Zero Trust Architecture"],
    "incident":    ["Data Breach","Ransomware Attack","Phishing Campaign","DDoS Attack","Insider Threat","Malware Infection","Unauthorized Access","Service Disruption","Data Exfiltration","Account Compromise","System Outage","SQL Injection Attack","Credential Theft","Advanced Persistent Threat","Social Engineering"],
    "incident_type":["Data Breach","Ransomware Attack","Phishing","DDoS","Insider Threat","Malware","Unauthorized Access","Service Disruption","Data Exfiltration","Account Compromise","SQL Injection","Credential Theft","APT","Social Engineering","Physical Security Breach"],
    "attack_type": ["SQL Injection","Cross-Site Scripting","DDoS","Phishing","Brute Force","Man-in-the-Middle","Ransomware","Zero-Day","Port Scan","Credential Stuffing","Social Engineering","Drive-by Download","DNS Spoofing","ARP Poisoning","Watering Hole"],
    "resolution":  ["Resolved","Escalated","Pending Review","Under Investigation","Closed — No Action","Mitigated","Patched","User Notified","System Restored","False Positive","Monitoring Continued","Referred to Vendor","Quarantined","Blocked at Firewall","Workaround Applied"],
    "resolution_status":["Resolved","Escalated","Pending","Under Investigation","Closed","Mitigated","Patched","False Positive","Monitoring","Quarantined","Blocked","Workaround Applied"],
    "detection_method":["SIEM Alert","IDS/IPS Alert","User Report","Log Analysis","Antivirus Detection","Honeypot Trigger","Threat Intelligence Feed","Manual Audit","Automated Scan","Anomaly Detection","Firewall Log","Endpoint Alert","Network Traffic Analysis","Email Filter","Third-party Report"],
    "impact":      ["Minimal","Low","Moderate","High","Critical","Catastrophic","No Impact","Data Loss","Financial Loss","Reputational Damage","Service Disruption","Regulatory Penalty"],
    "attack_source":["External Threat Actor","Insider Threat","Nation-State","Hacktivist","Criminal Organization","Script Kiddie","Competitor","Automated Bot","Phishing Campaign","Supply Chain Attack","Unknown"],
    "affected":    ["Web Application","Database Server","Email Server","File Server","Workstation","Mobile Device","Network Infrastructure","Cloud Service","API Gateway","IoT Device","Virtual Machine","Container","User Account","Third-party Service","Payment System"],
    "target":      ["Web Application","Database","Email System","File Server","Workstation","Network Device","Cloud Infrastructure","API","IoT Device","Payment System","User Credentials","Source Code","Intellectual Property","Customer Data","Financial Records"],
    "target_industry":["Finance","Healthcare","Government","Education","Retail","Technology","Manufacturing","Energy","Telecommunications","Transportation","Media","Legal","Insurance","Real Estate","Agriculture"],
    "industry":    ["Finance","Healthcare","Government","Education","Retail","Technology","Manufacturing","Energy","Telecommunications","Transportation","Media","Legal","Insurance","Real Estate","Agriculture"],
    "sector":      ["Public","Private","Non-profit","Government","Financial","Healthcare","Technology","Education","Energy","Retail","Manufacturing","Telecommunications","Media","Legal","Defense"],
    "mitigation":  ["Apply Security Patch","Update Firewall Rules","Reset Credentials","Block Malicious IP","Isolate Affected System","Enable MFA","Security Awareness Training","Restore from Backup","Engage Incident Response","Notify Stakeholders","Conduct Forensic Analysis","Implement Monitoring","Review Access Controls","Vulnerability Scan","Penetration Testing"],
}

_NUMERIC_SMART: dict[str, tuple[float, float, str]] = {
    "age":           (18,    80,       "normal"),
    "salary":        (25000, 150000,   "skewed"),
    "income":        (25000, 150000,   "skewed"),
    "wage":          (15,    100,      "skewed"),
    "price":         (1.0,   999.99,   "skewed"),
    "cost":          (1.0,   5000.0,   "skewed"),
    "amount":        (10.0,  10000.0,  "skewed"),
    "fee":           (1.0,   500.0,    "uniform"),
    "revenue":       (1000,  1000000,  "skewed"),
    "budget":        (500,   500000,   "skewed"),
    "balance":       (0,     100000,   "skewed"),
    "credit_score":  (300,   850,      "normal"),
    "score":         (0,     100,      "normal"),
    "rating":        (1,     5,        "normal"),
    "gpa":           (1.5,   4.0,      "normal"),
    "grade":         (60,    100,      "normal"),
    "year":          (2015,  2025,     "uniform"),
    "quantity":      (1,     500,      "skewed"),
    "qty":           (1,     500,      "skewed"),
    "stock":         (0,     1000,     "uniform"),
    "weight":        (40,    150,      "normal"),
    "height":        (150,   200,      "normal"),
    "bmi":           (17.5,  35.0,     "normal"),
    "temperature":   (36.0,  39.5,     "normal"),
    "attendance_rate":       (60.0, 100.0, "normal"),
    "attendance_percentage": (60.0, 100.0, "normal"),
    "attendance":            (60.0, 100.0, "normal"),
    "percent":       (0,     100,      "normal"),
    "percentage":    (0,     100,      "normal"),
    "pct":           (0,     100,      "normal"),
    "ratio":         (0.0,   1.0,      "uniform"),
    "discount":      (0,     70,       "skewed"),
    "tax":           (0,     30,       "normal"),
    "interest":      (0.1,   25.0,     "normal"),
    "distance":      (1,     10000,    "skewed"),
    "speed":         (0,     200,      "normal"),
    "latitude":      (-90,   90,       "uniform"),
    "longitude":     (-180,  180,      "uniform"),
    "lat":           (-90,   90,       "uniform"),
    "lon":           (-180,  180,      "uniform"),
    "lng":           (-180,  180,      "uniform"),
    "port":          (1024,  65535,    "uniform"),
    "duration":      (1,     3600,     "skewed"),
    "rank":          (1,     1000,     "uniform"),
    "capacity":      (1,     10000,    "skewed"),
    "population":    (1000,  10000000, "skewed"),
    "hours":         (0,     23,       "uniform"),
    "hour":          (0,     23,       "uniform"),
    "minutes":       (0,     59,       "uniform"),
    "seconds":       (0,     59,       "uniform"),
    "day_num":       (1,     31,       "uniform"),
    "month_num":     (1,     12,       "uniform"),
    "units":         (3,     24,       "uniform"),
    "marks":         (0,     100,      "normal"),
    "gwa":           (1.0,   4.0,      "normal"),
    "pulse":         (60,    100,      "normal"),
    "heart_rate":    (60,    100,      "normal"),
    "blood_pressure_systolic":  (90,  140, "normal"),
    "blood_pressure_diastolic": (60,  90,  "normal"),
    "order_total":   (100,   50000,    "skewed"),
    "invoice":       (500,   500000,   "skewed"),
    "tip":           (0,     500,      "skewed"),
    "profit":        (0,     100000,   "skewed"),
    "loss":          (0,     50000,    "skewed"),
    "expense":       (100,   50000,    "skewed"),
    "payment_amount":(100,   100000,   "skewed"),
    "transaction_amount":(100, 500000, "skewed"),
    "views":         (0,     100000,   "skewed"),
    "clicks":        (0,     10000,    "skewed"),
    "likes":         (0,     50000,    "skewed"),
    "shares":        (0,     5000,     "skewed"),
    "downloads":     (0,     10000,    "skewed"),
    "impressions":   (0,     500000,   "skewed"),
    "floor":         (1,     50,       "uniform"),
    "room":          (100,   999,      "uniform"),
    "unit":          (1,     200,      "uniform"),
    "zip":           (1000,  9999,     "uniform"),
    "passengers":    (1,     500,      "skewed"),
    "seats":         (1,     100,      "uniform"),
    "items":         (1,     100,      "skewed"),
    "pages":         (1,     500,      "skewed"),
    "chapters":      (1,     50,       "uniform"),
    "episodes":      (1,     100,      "uniform"),
    "seasons":       (1,     20,       "uniform"),
    "attempts":      (1,     10,       "skewed"),
    "errors":        (0,     50,       "skewed"),
    "retries":       (0,     5,        "skewed"),
    "response_time": (10,    5000,     "skewed"),
    "uptime":        (90.0,  100.0,    "normal"),
    "unit_price":    (500,   150000,   "skewed"),
    "unit_cost":     (300,   120000,   "skewed"),
    "selling_price": (500,   150000,   "skewed"),
    "purchase_price":(300,   120000,   "skewed"),
    "reorder_level": (5,     100,      "normal"),
    "reorder_point": (5,     100,      "normal"),
    "min_stock":     (5,     50,       "normal"),
    "max_stock":     (100,   1000,     "skewed"),
    "stock_before":  (0,     500,      "skewed"),
    "stock_after":   (0,     500,      "skewed"),
    "opening_stock": (0,     500,      "skewed"),
    "closing_stock": (0,     500,      "skewed"),
    "on_hand":       (0,     500,      "skewed"),
    "available":     (0,     500,      "skewed"),
    "total_value":   (1000,  5000000,  "skewed"),
    "inventory_value":(1000, 5000000,  "skewed"),
}


# Domain keywords → pool key override (checked before generic field-name matching).
# When a field's hint mentions a product/item but also contains a domain keyword,
# the domain-specific pool wins over the default electronics "product_name" pool.
_DOMAIN_PRODUCT_OVERRIDES: list[tuple[tuple[str, ...], str]] = [
    (("grocery","supermarket","hypermart","tiangge","palengke","wet market",
      "fresh market","convenience store","sari-sari"),                         "grocery_product"),
    (("clothing","apparel","fashion","garment","boutique","wear","uniform",
      "textile","tailoring","retail fashion","clothes"),                        "clothing_product"),
    (("medicine","pharmacy","pharmaceutical","drug store","medical supply",
      "health product","clinic supply","hospital supply","drugstore"),          "medical_product"),
    (("furniture","furnishing","home decor","interior design","home goods",
      "home store","office furniture"),                                         "furniture_product"),
    (("restaurant","cafe","cafeteria","canteen","menu","fast food",
      "food court","bistro","dining","eatery","diner"),                         "food_product"),
    (("bookstore","book shop","library","novel","textbook","publication",
      "reading material"),                                                       "book_title"),
    (("video game","game store","gaming shop","esport","console game",
      "game title","game shop"),                                                 "game_title"),
    (("hardware store","home depot","construction supply","tool shop",
      "building material"),                                                      "hardware_product"),
    (("cosmetics","beauty store","makeup","skincare","beauty product",
      "personal care store"),                                                    "cosmetics_product"),
    (("sports store","sporting goods","gym supply","athletic store",
      "fitness store"),                                                          "sports_product"),
    (("auto parts","car parts","automotive store","vehicle supply",
      "car accessories store"),                                                  "automotive_product"),
]

_PRODUCT_HINT_TRIGGERS = frozenset(
    ["product","item","sku","goods","merchandise","inventory","stock"]
)


def _extract_enum_from_description(description: str) -> list[str] | None:
    """
    Parse a field description for an explicit value list and return those values.
    Handles patterns like:
      - "one of: A, B, C"
      - "A, B, or C"
      - "A or B"
      - "choose from A, B, C"
      - "either A or B"
      - "Field label — A, B, C"  (after a dash or colon)
    Returns None when no clear list is found.
    """
    import re
    if not description:
        return None
    desc = description.strip()

    def _split_list(text: str) -> list[str] | None:
        text = re.sub(r'\bor\b', ',', text, flags=re.IGNORECASE)
        parts = [p.strip().strip('"\'()') for p in re.split(r'[,;]', text)]
        parts = [p for p in parts if 1 <= len(p) <= 60 and not p.isspace()]
        return parts if len(parts) >= 2 else None

    # "one of X, Y, Z"  or  "one of: X, Y, Z"
    m = re.search(r'one\s+of:?\s+(.+)', desc, re.IGNORECASE)
    if m:
        result = _split_list(m.group(1).split('.')[0])
        if result:
            return result

    # "choose from X, Y"  or  "from: X, Y"
    m = re.search(r'(?:choose\s+)?from:?\s+(.+)', desc, re.IGNORECASE)
    if m:
        result = _split_list(m.group(1).split('.')[0])
        if result and len(result) >= 2:
            return result

    # "either A or B"
    m = re.search(r'either\s+(.+)', desc, re.IGNORECASE)
    if m:
        result = _split_list(m.group(1).split('.')[0])
        if result:
            return result

    # "Label: A, B, C"  or  "Label — A, B, C"  (colon/dash followed by short list)
    m = re.search(r'[:\-–]\s*([A-Za-z0-9\-\s,/]+(?:\s+or\s+[A-Za-z0-9\-\s/]+)?)\s*$', desc)
    if m:
        result = _split_list(m.group(1))
        if result and 2 <= len(result) <= 12:
            return result

    # "(A, B, C)" or "(A, B, C, etc.)" — parenthesized value list anywhere in description
    for m in re.finditer(r'\(([^)]{4,})\)', desc):
        inner = re.sub(r'\betc\.?\b', '', m.group(1), flags=re.IGNORECASE).strip().rstrip(',').strip()
        result = _split_list(inner)
        if result and 2 <= len(result) <= 20:
            return result

    return None


def _keyword_pool(field_name: str, description: str) -> list | None:
    hint = (field_name + " " + description).lower().replace("_", " ")

    # Philippine geographic context: must run before standard pass so
    # "philippines region" doesn't fall through to the generic "region" pool
    _is_ph = any(k in hint for k in _PH_KEYWORDS)
    if _is_ph:
        if any(w in hint for w in ("region", "luzon", "visayas", "mindanao", "ncr")):
            return _POOLS["ph_region"]
        if "province" in hint:
            return _POOLS["ph_province"]
        if any(w in hint for w in ("city", "municipality", "ciudad", "lungsod")):
            return PH_CITIES
        if any(w in hint for w in ("barangay", "brgy", "village", "sitio")):
            # Use Olongapo barangays by default for Philippines context
            city = next((c for c in hint.split() if c.title() in _PH_GEO), "Olongapo City")
            _, brgys = _PH_GEO.get(city.title(), _PH_GEO["Olongapo City"])
            return brgys

    # Domain pre-pass: for product/item name fields, check domain context first
    # so "grocery product name" returns grocery products, not electronics
    if any(t in hint for t in _PRODUCT_HINT_TRIGGERS):
        for keywords, pool_key in _DOMAIN_PRODUCT_OVERRIDES:
            if pool_key in _POOLS and any(k in hint for k in keywords):
                return _POOLS[pool_key]

    # Standard pass: longest key wins (so "product_name" beats "product")
    for key in sorted(_POOLS.keys(), key=len, reverse=True):
        if key.replace("_", " ") in hint:
            return _POOLS[key]
    return None


def gen_col(ftype: str, n: int, c: Any, field_name: str = "", description: str = "") -> np.ndarray:
    """Generate n values for a column given its type, constraints, and name hints."""
    null_mask = np.random.random(n) < (min(getattr(c, "null_rate", 0) or 0, 50.0) / 100.0)
    fname = field_name.lower().replace(" ", "_").replace("-", "_")

    # ── Time fields: return HH:MM strings regardless of declared type ─────────
    if (fname.endswith("_time") or "_time_" in fname
            or fname in ("start_time", "end_time", "class_time", "open_time", "close_time")):
        if "end" in fname or "close" in fname:
            time_pool = _POOLS["end_time"]
        else:
            time_pool = _POOLS["start_time"]
        data = np.random.choice(time_pool, n).astype(object)
        data[null_mask] = None
        return data

    # Apply smart numeric ranges when the user left min/max blank
    if ftype in ("integer", "float"):
        min_val = getattr(c, "min_val", None)
        max_val = getattr(c, "max_val", None)
        if min_val is None and max_val is None:
            _ph_override = False
            # Philippine lat/lon bounds override global defaults
            if _is_ph_locale(field_name, description):
                if any(k in fname for k in ("lat", "latitude")):
                    class _C:
                        pass
                    _cc = _C()
                    _cc.min_val = 5.0; _cc.max_val = 21.0; _cc.distribution = "uniform"
                    _cc.null_rate = getattr(c, "null_rate", 0); _cc.enum_values = []
                    _cc.cardinality = None; _cc.date_from = None; _cc.date_to = None; _cc.true_ratio = 0.5
                    c = _cc; _ph_override = True
                elif any(k in fname for k in ("lon", "lng", "longitude")):
                    class _C:
                        pass
                    _cc = _C()
                    _cc.min_val = 116.0; _cc.max_val = 127.0; _cc.distribution = "uniform"
                    _cc.null_rate = getattr(c, "null_rate", 0); _cc.enum_values = []
                    _cc.cardinality = None; _cc.date_from = None; _cc.date_to = None; _cc.true_ratio = 0.5
                    c = _cc; _ph_override = True
            if not _ph_override:
                for kw, (s_lo, s_hi, s_dist) in _NUMERIC_SMART.items():
                    if kw in fname:
                        # Create a simple namespace so attribute access works below
                        class _C:
                            pass
                        _cc = _C()
                        _cc.min_val      = s_lo
                        _cc.max_val      = s_hi
                        _cc.distribution = s_dist
                        _cc.null_rate    = getattr(c, "null_rate", 0)
                        _cc.enum_values  = []
                        _cc.cardinality  = None
                        _cc.date_from    = None
                        _cc.date_to      = None
                        _cc.true_ratio   = 0.5
                        c = _cc
                        break

    dist         = getattr(c, "distribution", "uniform") or "uniform"
    enum_values  = getattr(c, "enum_values",  []) or []
    # Fallback: extract allowed values from the field description when no enum set
    if not enum_values and description:
        extracted = _extract_enum_from_description(description)
        if extracted:
            enum_values = extracted
    cardinality  = getattr(c, "cardinality",  None)
    date_from    = getattr(c, "date_from",    None)
    date_to      = getattr(c, "date_to",      None)
    true_ratio   = getattr(c, "true_ratio",   0.5)
    min_val      = getattr(c, "min_val",      None)
    max_val      = getattr(c, "max_val",      None)

    if ftype == "integer":
        lo = int(min_val) if min_val is not None else 1
        hi = int(max_val) if max_val is not None else 10_000
        if hi <= lo: hi = lo + 1
        if dist == "normal":
            mean, std = (lo + hi) / 2, (hi - lo) / 6
            data = np.clip(np.random.normal(mean, std, n), lo, hi).astype(int).astype(object)
        elif dist == "skewed":
            data = np.clip(np.random.exponential((hi - lo) / 4, n) + lo, lo, hi).astype(int).astype(object)
        else:
            data = np.random.randint(lo, hi + 1, n).astype(object)

    elif ftype == "float":
        lo = float(min_val) if min_val is not None else 0.0
        hi = float(max_val) if max_val is not None else 1_000.0
        if hi <= lo: hi = lo + 1.0
        if dist == "normal":
            mean, std = (lo + hi) / 2, (hi - lo) / 6
            data = np.round(np.clip(np.random.normal(mean, std, n), lo, hi), 2).astype(object)
        elif dist == "skewed":
            data = np.round(np.clip(np.random.exponential((hi - lo) / 4, n) + lo, lo, hi), 2).astype(object)
        else:
            data = np.round(np.random.uniform(lo, hi, n), 2).astype(object)

    elif ftype == "string":
        if enum_values:
            data = np.random.choice(enum_values, n).astype(object)

        elif any(p in fname for p in ("full_name", "fullname", "full name", "complete_name")):
            data = np.array([f"{random.choice(FIRST)} {random.choice(LAST)}" for _ in range(n)], dtype=object)
        elif any(p in fname for p in ("first_name", "firstname", "fname", "given_name", "forename")):
            data = np.array([random.choice(FIRST) for _ in range(n)], dtype=object)
        elif any(p in fname for p in ("last_name", "lastname", "lname", "surname", "family_name", "middle_name", "middlename")):
            data = np.array([random.choice(LAST) for _ in range(n)], dtype=object)

        elif any(p in fname for p in ("username", "user_name", "login", "handle", "screen_name", "account_name")):
            seps = [".", "_", ""]
            data = np.array([
                f"{random.choice(FIRST).lower()}{random.choice(seps)}{random.choice(LAST).lower()}"
                f"{random.randint(1,99) if random.random()<0.4 else ''}"
                for _ in range(n)
            ], dtype=object)

        elif any(p in fname for p in ("website", "url", "web_url", "link", "homepage", "site_url", "webpage")):
            prefixes = ["www.",""]
            tlds = [".com",".org",".net",".io",".co",".ph"]
            stems = ["tech","solutions","global","smart","digital","next","alpha","nova","prime","core","hub","lab","works","group","media"]
            data = np.array([
                f"https://{random.choice(prefixes)}{random.choice(LAST).lower()}{random.choice(stems)}{random.choice(tlds)}"
                for _ in range(n)
            ], dtype=object)

        elif any(p in fname for p in ("zip_code", "zipcode", "zip", "postal_code", "postcode", "postal")):
            data = np.array([f"{random.randint(1000, 9999)}" for _ in range(n)], dtype=object)

        elif any(p in fname for p in ("phone", "mobile", "contact_number", "contact_no",
                                       "cell", "cellphone", "telephone", "landline", "tel")):
            if _is_ph_locale(field_name, description):
                data = np.array([
                    f"{random.choice(PH_MOBILE_PREFIXES)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
                    for _ in range(n)
                ], dtype=object)
            else:
                data = np.array([
                    f"+1-{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
                    for _ in range(n)
                ], dtype=object)

        elif any(p in fname for p in ("address", "street", "home_address", "mailing_address",
                                       "residential_address", "billing_address", "shipping_address")):
            if _is_ph_locale(field_name, description):
                data = np.array([
                    _ph_address()
                    for _ in range(n)
                ], dtype=object)
            else:
                data = np.array([f"{random.randint(1,999)} {random.choice(STREETS)}" for _ in range(n)], dtype=object)

        elif fname == "name" or "_name" in fname:
            # Always check the pool first — person names are a last resort only for
            # fields that explicitly reference a person (customer, user, patient, etc.)
            smart_pool = _keyword_pool(field_name, description)
            if smart_pool:
                data = np.random.choice(smart_pool, n).astype(object)
            else:
                _PERSON_HINTS = (
                    "customer","user","patient","employee","staff","person",
                    "doctor","nurse","student","teacher","professor","faculty",
                    "instructor","advisor","guardian","parent","client","member",
                    "contact","buyer","seller","author","presenter","worker",
                    "manager","driver","rider","passenger","candidate","applicant",
                )
                _TECH_HINTS = (
                    "file","column","table","database","domain","host","service","app",
                    "system","page","class","function","variable","method","object",
                    "bucket","key","field","attr","property",
                )
                hint_text = (field_name + " " + description).lower()
                has_person = any(p in hint_text for p in _PERSON_HINTS)
                has_tech   = any(t in fname    for t in _TECH_HINTS)

                if has_person:
                    data = np.array(
                        [f"{random.choice(FIRST)} {random.choice(LAST)}" for _ in range(n)],
                        dtype=object,
                    )
                elif has_tech:
                    # Technical identifier name — short readable slugs
                    entity = (
                        fname.replace("_name", "").replace("name_", "").strip("_").title()
                        or "Item"
                    )
                    k = max(1, cardinality or 50)
                    labels = [f"{entity}_{str(j + 1).zfill(3)}" for j in range(min(k, 5_000))]
                    data = np.random.choice(labels, n).astype(object)
                else:
                    # Non-person entity with no pool (e.g. generic "name" in a products
                    # table, or a novel entity type) — use a labelled generic fallback
                    entity = (
                        fname.replace("_name", "").replace("name_", "").strip("_").title()
                        or "Item"
                    )
                    k = max(1, cardinality or 30)
                    labels = [f"{entity} {str(j + 1).zfill(2)}" for j in range(min(k, n))]
                    arr = np.array(labels * (n // len(labels) + 1), dtype=object)[:n]
                    np.random.shuffle(arr)
                    data = arr

        else:
            smart_pool = _keyword_pool(field_name, description)
            if smart_pool:
                data = np.random.choice(smart_pool, n).astype(object)
            else:
                entity = (
                    fname.replace("_name", "").replace("_value", "").replace("_type", "")
                         .replace("_code", "").strip("_").replace("_", " ").title()
                    or "Value"
                )
                k = max(1, cardinality or 50)
                labels = [f"{entity} {str(j + 1).zfill(2)}" for j in range(min(k, n))]
                arr = np.array(labels * (n // len(labels) + 1), dtype=object)[:n]
                np.random.shuffle(arr)
                data = arr

    elif ftype == "boolean":
        r = max(0.0, min(1.0, true_ratio))
        data = np.random.choice([True, False], n, p=[r, 1 - r]).astype(object)

    elif ftype == "date":
        try:
            d_from = datetime.strptime(date_from, "%Y-%m-%d") if date_from else datetime(2015, 1, 1)
        except ValueError:
            d_from = datetime(2015, 1, 1)
        try:
            d_to = datetime.strptime(date_to, "%Y-%m-%d") if date_to else datetime(2024, 12, 31)
        except ValueError:
            d_to = datetime(2024, 12, 31)
        delta = max(1, (d_to - d_from).days)
        data = np.array([(d_from + timedelta(days=int(d))).strftime("%Y-%m-%d")
                         for d in np.random.randint(0, delta, n)], dtype=object)

    elif ftype == "email":
        def _make_email(_):
            first  = random.choice(FIRST).lower()
            last   = random.choice(LAST).lower()
            sep    = random.choice([".", "_", ""])
            suffix = str(random.randint(1, 99)) if random.random() < 0.3 else ""
            return f"{first}{sep}{last}{suffix}@{random.choice(DOMAINS)}"
        data = np.array([_make_email(i) for i in range(n)], dtype=object)

    elif ftype == "uuid":
        data = np.array([str(uuid_module.uuid4()) for _ in range(n)], dtype=object)

    elif ftype == "phone":
        if _is_ph_locale(field_name, description):
            data = np.array([
                f"{random.choice(PH_MOBILE_PREFIXES)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
                for _ in range(n)
            ], dtype=object)
        else:
            data = np.array([
                f"+1-{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"
                for _ in range(n)
            ], dtype=object)

    elif ftype == "address":
        if _is_ph_locale(field_name, description):
            data = np.array([
                _ph_address()
                for _ in range(n)
            ], dtype=object)
        else:
            data = np.array([f"{random.randint(1,999)} {random.choice(STREETS)}" for _ in range(n)], dtype=object)

    elif ftype == "name":
        # Check pool first — product_name, brand_name, etc. should not become person names
        smart_pool = _keyword_pool(field_name, description)
        if smart_pool:
            data = np.random.choice(smart_pool, n).astype(object)
        else:
            _PERSON_HINTS = (
                "customer","user","patient","employee","staff","person",
                "doctor","nurse","student","teacher","professor","faculty",
                "instructor","advisor","guardian","parent","client","member",
                "contact","buyer","seller","author","presenter","worker",
                "manager","driver","rider","passenger","candidate","applicant",
                "first","last","full","given","middle","maiden",
            )
            hint_text = (field_name + " " + description).lower()
            has_person = any(p in hint_text for p in _PERSON_HINTS)
            if has_person or fname in ("name", "full_name", "first_name", "last_name", "given_name"):
                data = np.array(
                    [f"{random.choice(FIRST)} {random.choice(LAST)}" for _ in range(n)],
                    dtype=object,
                )
            else:
                # Non-person entity with type=name but no pool — generic label
                entity = (
                    fname.replace("_name", "").replace("name_", "").strip("_").title()
                    or "Item"
                )
                k = max(1, cardinality or 30)
                labels = [f"{entity} {str(j + 1).zfill(2)}" for j in range(min(k, n))]
                arr = np.array(labels * (n // len(labels) + 1), dtype=object)[:n]
                np.random.shuffle(arr)
                data = arr

    elif ftype == "ip":
        data = np.array([
            f"{random.randint(1,254)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
            for _ in range(n)
        ], dtype=object)

    else:
        entity = (
            fname.replace("_name", "").replace("_value", "").replace("_type", "")
                 .replace("_code", "").strip("_").replace("_", " ").title()
            or "Item"
        )
        k = max(1, cardinality or 30)
        labels = [f"{entity} {str(j + 1).zfill(2)}" for j in range(min(k, n))]
        arr = np.array(labels * (n // len(labels) + 1), dtype=object)[:n]
        np.random.shuffle(arr)
        data = arr

    data[null_mask] = None
    return data
