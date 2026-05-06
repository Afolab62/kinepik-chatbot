'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { 
  ArrowLeft, Activity, ExternalLink, Search, 
  ChevronRight, Dna, FlaskConical, Target 
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AnimatedBackground } from '@/components/animated-background'

// Extended kinase family data with more details
const KINASE_FAMILIES_EXTENDED = {
  AGC: {
    fullName: 'Protein Kinase A, G, and C families',
    description: 'Named after PKA, PKG, and PKC. These kinases typically phosphorylate substrates with basic residues at -3 position. They are often regulated by second messengers like cAMP and calcium.',
    members: [
      { name: 'PKA', uniprot: 'P17612', substrates: 'CREB, VASP, RyR', pathways: ['cAMP Signaling', 'GPCR Signaling'] },
      { name: 'PKB/Akt', uniprot: 'P31749', substrates: 'GSK3β, FOXO1, TSC2', pathways: ['PI3K/Akt Signaling', 'Insulin Signaling'] },
      { name: 'PKC', uniprot: 'P05771', substrates: 'MARCKS, GAP43', pathways: ['Calcium Signaling', 'DAG Signaling'] },
      { name: 'PKG', uniprot: 'Q13976', substrates: 'VASP, PDE5', pathways: ['cGMP Signaling', 'Smooth Muscle Relaxation'] },
      { name: 'RSK', uniprot: 'Q15418', substrates: 'CREB, c-Fos', pathways: ['MAPK Signaling', 'Cell Proliferation'] },
      { name: 'SGK', uniprot: 'O00141', substrates: 'NDRG1, ENaC', pathways: ['Sodium Transport', 'Cell Survival'] },
      { name: 'PDK1', uniprot: 'O15530', substrates: 'Akt, S6K, SGK', pathways: ['PI3K Signaling', 'AGC Kinase Activation'] },
    ],
    features: ['Basophilic substrate preference', 'Often regulated by second messengers', 'C-terminal hydrophobic motif'],
    color: 'from-emerald-500/20 to-teal-500/20',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  },
  CAMK: {
    fullName: 'Calcium/Calmodulin-dependent Kinases',
    description: 'Activated by calcium/calmodulin. Involved in learning, memory, and neuronal plasticity. Many have autoinhibitory domains that are released upon calcium binding.',
    members: [
      { name: 'CaMKII', uniprot: 'Q13554', substrates: 'CREB, Synapsin', pathways: ['Calcium Signaling', 'Synaptic Plasticity'] },
      { name: 'DAPK', uniprot: 'P53355', substrates: 'MLC, Beclin-1', pathways: ['Apoptosis', 'Autophagy'] },
      { name: 'MLCK', uniprot: 'Q15746', substrates: 'MLC', pathways: ['Smooth Muscle Contraction', 'Cytoskeleton'] },
      { name: 'MARK', uniprot: 'Q7KZI7', substrates: 'Tau, MAP2', pathways: ['Microtubule Regulation', 'Cell Polarity'] },
      { name: 'AMPK', uniprot: 'Q13131', substrates: 'ACC, TSC2', pathways: ['Energy Homeostasis', 'Metabolism'] },
    ],
    features: ['Calcium-dependent activation', 'Autoinhibitory domain', 'CaM-binding region'],
    color: 'from-blue-500/20 to-indigo-500/20',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  CK1: {
    fullName: 'Casein Kinase 1 family',
    description: 'Constitutively active kinases that prefer acidic substrates. Play key roles in Wnt signaling, circadian rhythms, and DNA damage response.',
    members: [
      { name: 'CK1α', uniprot: 'P48729', substrates: 'β-catenin, p53', pathways: ['Wnt Signaling', 'Cell Cycle'] },
      { name: 'CK1δ', uniprot: 'P48730', substrates: 'PER, CRY', pathways: ['Circadian Rhythm', 'DNA Repair'] },
      { name: 'CK1ε', uniprot: 'P49674', substrates: 'Dishevelled, p53', pathways: ['Wnt Signaling', 'Circadian Rhythm'] },
      { name: 'CK1γ', uniprot: 'Q9HCP0', substrates: 'LRP6', pathways: ['Wnt Signaling', 'Membrane Signaling'] },
    ],
    features: ['Acidophilic substrate preference', 'Constitutively active', 'Multiple isoforms'],
    color: 'from-amber-500/20 to-orange-500/20',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-600 dark:text-amber-400',
  },
  CMGC: {
    fullName: 'CDK, MAPK, GSK, CLK families',
    description: 'Named after their founding members. Many are proline-directed kinases crucial for cell cycle regulation, signal transduction, and RNA splicing.',
    members: [
      { name: 'CDK1', uniprot: 'P06493', substrates: 'Histone H1, Lamin', pathways: ['Cell Cycle', 'Mitosis'] },
      { name: 'CDK2', uniprot: 'P24941', substrates: 'RB1, E2F1, p27', pathways: ['Cell Cycle', 'G1/S Transition'] },
      { name: 'ERK1/2', uniprot: 'P27361', substrates: 'c-Fos, ELK1', pathways: ['MAPK Signaling', 'Proliferation'] },
      { name: 'p38', uniprot: 'Q16539', substrates: 'ATF2, MK2', pathways: ['Stress Response', 'Inflammation'] },
      { name: 'JNK', uniprot: 'P45983', substrates: 'c-Jun, ATF2', pathways: ['Stress Response', 'Apoptosis'] },
      { name: 'GSK3β', uniprot: 'P49841', substrates: 'β-catenin, Glycogen synthase', pathways: ['Wnt Signaling', 'Glycogen Metabolism'] },
      { name: 'DYRK', uniprot: 'Q13627', substrates: 'NFAT, Tau', pathways: ['Brain Development', 'Down Syndrome'] },
    ],
    features: ['Proline-directed (most members)', 'Activation loop phosphorylation', 'Often require docking motifs'],
    color: 'from-rose-500/20 to-pink-500/20',
    borderColor: 'border-rose-500/30',
    textColor: 'text-rose-600 dark:text-rose-400',
  },
  STE: {
    fullName: 'Homologs of yeast STE kinases',
    description: 'Form the core of MAPK signaling cascades (MAP3K → MAP2K → MAPK). Essential for transmitting extracellular signals to the nucleus.',
    members: [
      { name: 'MEK1/2', uniprot: 'Q02750', substrates: 'ERK1/2', pathways: ['MAPK Cascade', 'Growth Factor Signaling'] },
      { name: 'MKK4', uniprot: 'P45985', substrates: 'JNK, p38', pathways: ['Stress Signaling', 'Apoptosis'] },
      { name: 'RAF', uniprot: 'P04049', substrates: 'MEK1/2', pathways: ['Ras Signaling', 'Proliferation'] },
      { name: 'MEKK1', uniprot: 'Q13233', substrates: 'MKK4, MKK7', pathways: ['JNK Cascade', 'NF-κB Signaling'] },
      { name: 'PAK', uniprot: 'Q13153', substrates: 'MEK1, RAF', pathways: ['Cytoskeleton', 'Cell Motility'] },
    ],
    features: ['Form kinase cascades', 'Scaffold protein interactions', 'MAPK pathway components'],
    color: 'from-violet-500/20 to-purple-500/20',
    borderColor: 'border-violet-500/30',
    textColor: 'text-violet-600 dark:text-violet-400',
  },
  TK: {
    fullName: 'Tyrosine Kinases',
    description: 'Phosphorylate tyrosine residues. Include receptor tyrosine kinases (RTKs) and non-receptor types. Key drivers of growth factor signaling and frequently mutated in cancer.',
    members: [
      { name: 'EGFR', uniprot: 'P00533', substrates: 'PLCγ, SHC', pathways: ['EGF Signaling', 'Cell Proliferation'] },
      { name: 'VEGFR', uniprot: 'P17948', substrates: 'PLCγ, PI3K', pathways: ['Angiogenesis', 'Vascular Development'] },
      { name: 'FGFR', uniprot: 'P11362', substrates: 'FRS2, PLCγ', pathways: ['FGF Signaling', 'Development'] },
      { name: 'Src', uniprot: 'P12931', substrates: 'FAK, Cortactin', pathways: ['Integrin Signaling', 'Cell Adhesion'] },
      { name: 'Abl', uniprot: 'P00519', substrates: 'CRK, STAT5', pathways: ['DNA Damage Response', 'Cytoskeleton'] },
      { name: 'JAK', uniprot: 'P23458', substrates: 'STATs', pathways: ['Cytokine Signaling', 'Immune Response'] },
      { name: 'InsR', uniprot: 'P06213', substrates: 'IRS1, SHC', pathways: ['Insulin Signaling', 'Metabolism'] },
    ],
    features: ['Phosphorylate tyrosine residues', 'SH2/SH3 domains common', 'Often oncogenic when mutated'],
    color: 'from-cyan-500/20 to-sky-500/20',
    borderColor: 'border-cyan-500/30',
    textColor: 'text-cyan-600 dark:text-cyan-400',
  },
  TKL: {
    fullName: 'Tyrosine Kinase-Like',
    description: 'Serine/threonine kinases with structural similarity to tyrosine kinases. Include important signaling regulators like RAF and inflammatory pathway kinases.',
    members: [
      { name: 'BRAF', uniprot: 'P15056', substrates: 'MEK1/2', pathways: ['MAPK Signaling', 'Melanoma'] },
      { name: 'MLK', uniprot: 'Q02779', substrates: 'MKK4/7', pathways: ['JNK Cascade', 'Apoptosis'] },
      { name: 'IRAK', uniprot: 'P51617', substrates: 'TRAF6', pathways: ['TLR Signaling', 'Innate Immunity'] },
      { name: 'RIPK', uniprot: 'Q13546', substrates: 'MLKL', pathways: ['Necroptosis', 'Inflammation'] },
      { name: 'LRRK2', uniprot: 'Q5S007', substrates: 'Rab proteins', pathways: ['Vesicle Trafficking', "Parkinson's Disease"] },
    ],
    features: ['Mixed specificity possible', 'Structurally similar to TKs', 'Diverse substrates'],
    color: 'from-lime-500/20 to-green-500/20',
    borderColor: 'border-lime-500/30',
    textColor: 'text-lime-600 dark:text-lime-400',
  },
  OTHER: {
    fullName: 'Other Kinases',
    description: 'Kinases that do not fit other groups. Include important cell cycle regulators like Aurora and PLK, as well as atypical kinases.',
    members: [
      { name: 'Aurora A', uniprot: 'O14965', substrates: 'PLK1, TPX2', pathways: ['Mitosis', 'Centrosome Maturation'] },
      { name: 'Aurora B', uniprot: 'Q96GD4', substrates: 'Histone H3, INCENP', pathways: ['Chromosome Segregation', 'Cytokinesis'] },
      { name: 'PLK1', uniprot: 'P53350', substrates: 'CDC25C, Cyclin B', pathways: ['Mitosis', 'G2/M Transition'] },
      { name: 'NEK2', uniprot: 'P51955', substrates: 'C-Nap1, Rootletin', pathways: ['Centrosome Cycle', 'Chromosome Segregation'] },
      { name: 'WEE1', uniprot: 'P30291', substrates: 'CDK1', pathways: ['G2/M Checkpoint', 'DNA Damage Response'] },
      { name: 'CK2', uniprot: 'P68400', substrates: 'p53, PTEN', pathways: ['Cell Survival', 'DNA Repair'] },
    ],
    features: ['Diverse mechanisms', 'Cell cycle regulation (Aurora, PLK)', 'Various cellular functions'],
    color: 'from-slate-500/20 to-gray-500/20',
    borderColor: 'border-slate-500/30',
    textColor: 'text-slate-600 dark:text-slate-400',
  },
}

export default function KinaseFamiliesPage() {
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  const filteredFamilies = Object.entries(KINASE_FAMILIES_EXTENDED).filter(([key, family]) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      key.toLowerCase().includes(query) ||
      family.fullName.toLowerCase().includes(query) ||
      family.members.some(m => m.name.toLowerCase().includes(query))
    )
  })

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground />
      
      <main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Kinase Families</h1>
            <p className="text-muted-foreground text-sm">Explore the human kinome classification</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search kinase families or members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>

        {/* Family Grid or Detail View */}
        <AnimatePresence mode="wait">
          {selectedFamily ? (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <FamilyDetailView
                familyKey={selectedFamily}
                family={KINASE_FAMILIES_EXTENDED[selectedFamily as keyof typeof KINASE_FAMILIES_EXTENDED]}
                expandedMember={expandedMember}
                onExpandMember={setExpandedMember}
                onBack={() => {
                  setSelectedFamily(null)
                  setExpandedMember(null)
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filteredFamilies.map(([key, family], index) => (
                <motion.button
                  key={key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedFamily(key)}
                  className={cn(
                    'p-5 bg-card border rounded-xl text-left transition-all hover:shadow-lg',
                    'hover:scale-[1.02] group',
                    family.borderColor
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3',
                    family.color
                  )}>
                    <Dna className={cn('w-5 h-5', family.textColor)} />
                  </div>
                  
                  <h3 className={cn('font-bold text-lg', family.textColor)}>{key}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{family.fullName}</p>
                  
                  <p className="text-xs text-foreground/70 line-clamp-2 mb-3">
                    {family.description}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {family.members.length} members
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

interface FamilyDetailViewProps {
  familyKey: string
  family: typeof KINASE_FAMILIES_EXTENDED[keyof typeof KINASE_FAMILIES_EXTENDED]
  expandedMember: string | null
  onExpandMember: (name: string | null) => void
  onBack: () => void
}

function FamilyDetailView({ familyKey, family, expandedMember, onExpandMember, onBack }: FamilyDetailViewProps) {
  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        Back to all families
      </Button>

      {/* Family Header */}
      <div className={cn(
        'p-6 rounded-xl border bg-gradient-to-br',
        family.color,
        family.borderColor
      )}>
        <div className="flex items-start gap-4">
          <div className={cn(
            'w-14 h-14 rounded-xl bg-card/50 flex items-center justify-center'
          )}>
            <Dna className={cn('w-7 h-7', family.textColor)} />
          </div>
          <div className="flex-1">
            <h2 className={cn('text-2xl font-bold', family.textColor)}>{familyKey}</h2>
            <p className="text-muted-foreground">{family.fullName}</p>
            <p className="mt-2 text-sm text-foreground/80">{family.description}</p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-4 flex flex-wrap gap-2">
          {family.features.map((feature, idx) => (
            <span
              key={idx}
              className="px-3 py-1 bg-card/60 rounded-full text-xs text-foreground"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* Members List */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Family Members ({family.members.length})
        </h3>
        
        <div className="space-y-3">
          {family.members.map((member, idx) => (
            <motion.div
              key={member.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                'border rounded-xl overflow-hidden bg-card transition-all',
                expandedMember === member.name ? 'shadow-lg' : ''
              )}
            >
              <button
                onClick={() => onExpandMember(expandedMember === member.name ? null : member.name)}
                className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    'bg-gradient-to-br',
                    family.color
                  )}>
                    <FlaskConical className={cn('w-4 h-4', family.textColor)} />
                  </div>
                  <div className="text-left">
                    <span className="font-medium text-foreground">{member.name}</span>
                    <p className="text-xs text-muted-foreground">{member.uniprot}</p>
                  </div>
                </div>
                <ChevronRight className={cn(
                  'w-4 h-4 text-muted-foreground transition-transform',
                  expandedMember === member.name && 'rotate-90'
                )} />
              </button>

              <AnimatePresence>
                {expandedMember === member.name && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-0 border-t border-border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Known Substrates
                          </h4>
                          <p className="text-sm text-foreground">{member.substrates}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Related Pathways
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {member.pathways.map((pathway, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 bg-muted rounded text-xs text-foreground"
                              >
                                {pathway}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex gap-2">
                        <a
                          href={`https://www.uniprot.org/uniprot/${member.uniprot}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View on UniProt
                        </a>
                        <a
                          href={`https://kinepik.org/api/0/kinases/specific?kinase_ids=${member.uniprot}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <Target className="w-3 h-3" />
                          KINEPIK API
                        </a>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
