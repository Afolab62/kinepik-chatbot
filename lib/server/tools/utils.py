import re


_UNIPROT_PATTERN = re.compile(
    r"^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$"
)


_COMMON_GENE_NAMES = {
    "P42345": "MTOR",
    "P31749": "AKT1",
    "P31751": "AKT2",
    "Q9Y243": "AKT3",
    "P00533": "EGFR",
    "P24941": "CDK2",
    "P28482": "MAPK1",
    "P27361": "MAPK3",
    "O15530": "PDK1",
    "P42336": "PIK3CA",
    "P60484": "PTEN",
    "P12931": "SRC",
    "P23458": "JAK1",
    "O60674": "JAK2",
    "P40763": "STAT3",
    "P04049": "RAF1",
    "P15056": "BRAF",
    "Q02750": "MAP2K1",
    "Q16539": "MAPK14",
    "P45983": "MAPK8",
    "Q15418": "RPS6KA1",
    "P23443": "RPS6KB1",
    "Q13541": "EIF4EBP1",
    "Q15831": "STK11",
    "Q13131": "PRKAA1",
    "P49841": "GSK3B",
    "O14757": "CHEK1",
    "O96017": "CHEK2",
}


def looks_like_uniprot_id(value):
    if not isinstance(value, str):
        return False
    value = value.strip()
    return bool(_UNIPROT_PATTERN.fullmatch(value))


def batch_uniprot_to_gene(uniprot_ids):
    return {
        uid: _COMMON_GENE_NAMES.get(uid, uid)
        for uid in uniprot_ids
        if isinstance(uid, str) and uid.strip()
    }
