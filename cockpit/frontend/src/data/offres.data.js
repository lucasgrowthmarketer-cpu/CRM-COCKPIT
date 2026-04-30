/**
 * offres.data.js — Catalogue des offres Industrial Decision
 * 
 * Centralise toutes les données des offres pour la page Catalogue.
 * Pour modifier un prix, un livrable ou ajouter une offre, 
 * c'est ICI que ça se passe — pas dans le composant.
 *
 * Structure d'une offre :
 *   id           : slug unique
 *   nom          : nom commercial
 *   prix         : prix HT en chiffre (pour calculs)
 *   prix_label   : prix formaté pour affichage ("4 250 € HT")
 *   prix_unite   : "one-shot" | "mois" | "sur devis"
 *   featured     : true → carte mise en avant
 *   type         : "one-shot" | "recurrent" | "devis"
 *   cible        : profil ICP cible (court)
 *   cible_full   : description plus détaillée
 *   pitch        : phrase de positionnement
 *   livrables    : tableau des livrables (puces)
 *   delai        : "Sous 6 semaines"
 *   echeancier   : modalités de paiement
 *   when_propose : quand la proposer commercialement
 *   color        : couleur d'accent ("blue" | "orange" | "dark")
 */

export const OFFRES = [
  {
    id: "audit",
    nom: "Audit Stratégique",
    prix: 2500,
    prix_label: "2 500 € HT",
    prix_unite: "one-shot",
    featured: false,
    type: "one-shot",
    color: "blue",
    cible: "Dirigeant prudent · Diagnostic avant engagement",
    cible_full: "PME industrielles qui hésitent à s'engager dans un Pack et veulent un diagnostic chiffré avant.",
    pitch: "Document de 30 à 40 pages : diagnostic présence digitale + analyse concurrentielle + plan d'action chiffré.",
    livrables: [
      "Analyse SEO du site actuel (technique, contenu, autorité)",
      "Benchmark des 5 concurrents directs (positionnement, mots-clés, trafic estimé)",
      "Liste des opportunités prioritaires (ce qu'il faut faire en premier)",
      "Plan d'action sur 12 mois avec budget recommandé",
      "1h de restitution en visio avec le dirigeant et son équipe",
    ],
    delai: "Livré sous 3 semaines",
    echeancier: "50% à la signature, 50% à la remise du document",
    engagement: "Aucun",
    when_propose: "Prospect qui hésite ou qui veut « voir avant de signer ». Déductible du Pack Démarrage si embraye derrière.",
  },
  {
    id: "pack-demarrage",
    nom: "Pack Démarrage",
    prix: 4250,
    prix_label: "4 250 € HT",
    prix_unite: "one-shot",
    featured: true,
    type: "one-shot",
    color: "blue",
    cible: "PME 2-10 M€ · Premier projet digital",
    cible_full: "PME industrielles qui n'ont jamais investi sérieusement dans le digital. Site obsolète, présence Google nulle.",
    pitch: "Notre offre d'entrée standard. Tout ce qu'il faut pour qu'une PME bascule d'un site vitrine à une vraie présence qui génère des leads.",
    livrables: [
      "Refonte complète du site (stack moderne, mobile-friendly, rapide)",
      "Création du catalogue produit en ligne (jusqu'à 30 fiches produit)",
      "Référencement local (Google Business Profile multi-sites) + national (mots-clés métier)",
      "Mise en place de la mesure (GA4, Search Console, suivi des demandes entrantes)",
      "1 mois de production de contenu inclus (2 articles + 5 fiches produit)",
      "Accompagnement trimestriel (1 visio par trimestre pendant 12 mois)",
    ],
    delai: "Livré sous 6 semaines",
    echeancier: "40% à la signature · 30% à la mise en ligne · 30% à la livraison finale",
    engagement: "Aucun (mais accompagnement très recommandé)",
    when_propose: "Offre standard si tu décroches un RDV avec un dirigeant qui n'a jamais investi dans le digital.",
  },
  {
    id: "pack-performance",
    nom: "Pack Performance Industrielle",
    prix: 8500,
    prix_label: "8 500 € HT",
    prix_unite: "one-shot",
    featured: false,
    type: "one-shot",
    color: "orange",
    cible: "PME 10-30 M€ · Vente neuf + occasion",
    cible_full: "Distributeurs de machines-outils, revendeurs d'équipements d'occasion, négoces industriels avec parc machines à valoriser.",
    pitch: "Pour les PME qui ont à la fois une activité de vente neuf et de revente d'équipement d'occasion. On ajoute la couche commerciale au Pack Démarrage.",
    livrables: [
      "Tout le contenu du Pack Démarrage",
      "Catalogue d'occasion en ligne avec mise à jour mensuelle",
      "Espace « vente du mois » pour mettre en avant les machines disponibles",
      "Canal de paiement en ligne pour acomptes ou ventes directes",
      "Upsell trimestriel structuré (relances clients dormants, campagnes saisonnières)",
    ],
    delai: "Livré sous 8 semaines",
    echeancier: "40% à la signature · 30% à la mise en ligne · 30% à la livraison finale",
    engagement: "Aucun",
    when_propose: "Distributeurs de machines-outils (type SCOMO, Perreau, ALMA), revendeurs d'équipements d'occasion, négoces.",
  },
  {
    id: "accompagnement-essentiel",
    nom: "Accompagnement Essentiel",
    prix: 1500,
    prix_label: "1 500 € HT / mois",
    prix_unite: "mois",
    featured: false,
    type: "recurrent",
    color: "blue",
    cible: "PME 2-10 M€",
    cible_full: "PME qui sortent du Pack Démarrage et veulent un suivi régulier sans investissement lourd.",
    pitch: "Le palier d'entrée du récurrent. Sans accompagnement, le site retombe dans l'oubli en 3 mois.",
    livrables: [
      "1 article de fond par mois (1 200 mots, optimisé SEO)",
      "4 fiches produit par mois (rédaction, intégration, optimisation)",
      "Suivi des positions Google sur les mots-clés cibles",
      "1h de visio par trimestre avec Lucas",
      "Rapport mensuel automatisé (positions, trafic, demandes entrantes)",
    ],
    delai: "Démarrage immédiat post-Pack",
    echeancier: "Mensualité prélevée le 1er du mois (SEPA ou virement)",
    engagement: "12 mois reconductibles tacitement",
    when_propose: "Tous les clients post-Pack Démarrage. À proposer systématiquement.",
  },
  {
    id: "accompagnement-performance",
    nom: "Accompagnement Performance",
    prix: 2500,
    prix_label: "2 500 € HT / mois",
    prix_unite: "mois",
    featured: true,
    type: "recurrent",
    color: "blue",
    cible: "PME 10-30 M€ · Best-seller",
    cible_full: "PME en croissance qui veulent générer un flux régulier de leads et investir dans le netlinking.",
    pitch: "Notre meilleur rapport résultats / investissement. Le palier que choisissent 60% de nos clients.",
    livrables: [
      "2 articles de fond par mois",
      "10 fiches produit par mois",
      "Netlinking ciblé : 5 backlinks de qualité par mois (annuaires, médias spécialisés)",
      "Optimisation Google Business Profile multi-sites",
      "1h de visio par mois avec Lucas",
      "Rapport mensuel commenté",
    ],
    delai: "Démarrage immédiat post-Pack",
    echeancier: "Mensualité prélevée le 1er du mois (SEPA ou virement)",
    engagement: "12 mois reconductibles tacitement",
    when_propose: "Best-seller à proposer aux PME 10-30M€ qui veulent du résultat tangible mois après mois.",
  },
  {
    id: "accompagnement-croissance",
    nom: "Accompagnement Croissance",
    prix: 3500,
    prix_label: "3 500 € HT / mois",
    prix_unite: "mois",
    featured: false,
    type: "recurrent",
    color: "orange",
    cible: "ETI 30 M€+",
    cible_full: "ETI ambitieuses qui veulent dominer leur marché digital, A/B tester, optimiser pour les nouveaux moteurs IA.",
    pitch: "Le top du récurrent. Inclut l'optimisation IA Search (Perplexity, ChatGPT, Gemini) et l'A/B testing trimestriel.",
    livrables: [
      "4 articles de fond par mois",
      "20 fiches produit par mois",
      "Netlinking premium : 10 backlinks de qualité (médias top, partenariats)",
      "Optimisation IA Search (Perplexity, ChatGPT, Gemini)",
      "A/B testing trimestriel sur les pages clés",
      "2h de visio par mois avec Lucas",
      "Rapport mensuel + revue stratégique trimestrielle",
    ],
    delai: "Démarrage immédiat post-Pack",
    echeancier: "Mensualité prélevée le 1er du mois (SEPA ou virement)",
    engagement: "12 mois reconductibles tacitement",
    when_propose: "ETI ambitieuses, marchés très concurrentiels, dirigeants qui veulent rester à la pointe.",
  },
  {
    id: "pack-plateforme",
    nom: "Pack Plateforme",
    prix: null,
    prix_label: "Sur devis",
    prix_unite: "à partir de 10 000 € HT",
    featured: false,
    type: "devis",
    color: "dark",
    cible: "ETI / Groupe · Outils internes connectés",
    cible_full: "ETI qui veulent aller au-delà de la présence Google : intégration ERP/CRM, espace client, configurateur produit.",
    pitch: "Pour aller au-delà du SEO et construire un vrai dispositif digital intégré.",
    livrables: [
      "Cadrage technique et fonctionnel détaillé",
      "Intégration ERP / CRM existant",
      "Espace client privatif",
      "Configurateur produit (selon métier)",
      "Workflows automatisés (devis, relances, paiements)",
      "Accompagnement mensuel inclus 6 mois",
    ],
    delai: "3 à 6 mois selon périmètre",
    echeancier: "Selon devis (généralement 30% / 30% / 30% / 10%)",
    engagement: "Selon devis",
    when_propose: "Ne se vend pas en cold call. Si un prospect évoque ce besoin, remontée à Lucas pour un RDV de cadrage.",
  },
];

// ============================================================
// Helpers utilitaires
// ============================================================
export const getOffre = (id) => OFFRES.find(o => o.id === id);

export const getOffresByType = (type) => OFFRES.filter(o => o.type === type);

export const getFeaturedOffres = () => OFFRES.filter(o => o.featured);

// Doctrine commerciale (pour la page)
export const DOCTRINE = {
  budget_lines: "Les Packs sont non séparables. On ne casse pas un Pack en lignes pour vendre une partie seule. Réponse type : « Le Pack est conçu comme un tout — un site sans contenu, c'est une voiture sans essence. »",
  pricing_at_call: "Donne les fourchettes au tel (4 000 à 9 000 € HT mise en route, 1 500 à 3 500 €/mois récurrent). Jamais le prix exact d'un pack au tel sauf si le prospect insiste deux fois.",
  promise: "5 à 15 demandes entrantes qualifiées par mois, en 6 semaines après livraison du Pack. Pas 15-30. Pas 50.",
  no_compare: "On ne se compare jamais à des concurrents (ni en bien ni en mal). On parle de notre méthode et de nos résultats.",
  language: "« Nous » et non « on ». Pas de jargon technique au tel. Pas de superlatifs vides. Données concrètes > affirmations générales.",
};

// Ce qu'on ne fait PAS
export const SKIP_LIST = [
  "Sites pour artisans purs (1-5 personnes) ou commerces locaux",
  "Filiales françaises de groupes étrangers (décisions au siège)",
  "Boîtes en redressement judiciaire ou procédure collective",
  "Grands groupes cotés (cycle de vente trop long)",
  "Startups industrielles < 5 ans et < 2 M€ CA",
];
