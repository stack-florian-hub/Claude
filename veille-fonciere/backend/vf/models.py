from dataclasses import asdict, dataclass, field


@dataclass
class Annonce:
    """Annonce normalisée, quelle que soit la source."""
    source: str
    source_id: str
    url: str
    departement: str
    titre: str = ""
    description: str = ""
    prix: float | None = None
    surface_m2: float | None = None
    code_insee: str | None = None
    commune: str | None = None
    code_postal: str | None = None
    lat: float | None = None
    lon: float | None = None
    precision_geo: str | None = None   # parcelle | adresse | approx | commune
    ref_cadastrale: str | None = None
    typologie: str | None = None
    mode_vente: str = "gre_a_gre"
    photo_url: str | None = None
    date_publication: str | None = None
    brut: dict = field(default_factory=dict)

    @property
    def id(self):
        return f"{self.source}:{self.source_id}"

    @property
    def prix_m2(self):
        if self.prix and self.surface_m2:
            return self.prix / self.surface_m2
        return None

    def to_dict(self):
        d = asdict(self)
        d["id"] = self.id
        return d
