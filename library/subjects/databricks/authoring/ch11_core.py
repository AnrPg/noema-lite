"""Shared builder for ch11 (Unity Catalog Mastery). Extends chlib.Chapter with coverage tracking."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chlib import Chapter


class Ch(Chapter):
    """Chapter that records which source topic every exercise / playbook covers (for the coverage file)."""
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.topic = None
        self.cov = []          # list of [topic, section, [exercise ids]]

    def T(self, label):
        """Start a new coverage topic (source heading / concept)."""
        self.topic = [label, self.cur, []]
        self.cov.append(self.topic)

    def _e(self, *a, **k):
        eid = super()._e(*a, **k)
        if self.topic is not None:
            self.topic[2].append(eid)
        return eid


c = Ch("ch11", 11,
       title="Unity Catalog Mastery",
       subtitle="Phase 3 — metastore → catalog → schema → object, grants, storage, volumes, policies and the PERMISSION_DENIED algorithm",
       emoji="🛡️",
       sourcePages="403–456",
       mantra="Every Unity Catalog question is four questions — WHO? WHAT OBJECT? WHAT ACTION? WHERE ARE THE BYTES? — and every PERMISSION_DENIED is a walk down the whole authorization chain, not just \"do I have SELECT?\".",
       objectives=[
           "You can explain why Unity Catalog exists, what it stores (metadata, permissions, lineage, storage references) and what it does NOT store (the bytes).",
           "You can place metastore, workspace, catalog, schema and object correctly and parse any `catalog.schema.object` name.",
           "You can write real GRANT / REVOKE / SHOW GRANTS statements and predict the effect of USE CATALOG, USE SCHEMA, inheritance, ownership, MANAGE, ALL PRIVILEGES and BROWSE.",
           "You can contrast managed vs external tables and volumes, including what DROP does to the files.",
           "You can explain the chain cloud IAM → storage credential → external location → external table/volume → files, and managed storage locations.",
           "You can protect data with row filters, column masks and ABAC, and use lineage for impact analysis and debugging.",
           "You can design the grants of a production lakehouse (groups + service principals, least privilege).",
           "You can debug any PERMISSION_DENIED with the 8-layer algorithm (I Bet Cats Sit On Fluffy Silk Cushions) and the six classic cases."])
