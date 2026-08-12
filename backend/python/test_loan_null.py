"""Quick repro test: generate loan_applicants with null_rate > 0"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from relational_gen import generate_relational_dataset

class C:
    min_val = None; max_val = None; distribution = "uniform"
    enum_values = []; cardinality = None; date_from = None; date_to = None
    true_ratio = 0.5; null_rate = 10.0; id_prefix = None; id_pad = 4
    condition = None; condition_true_value = "approved"; condition_false_value = "declined"
    condition_true_prob = 0.8; condition_false_prob = 0.8

class CBool(C):
    null_rate = 0.0   # approved has no null

class F:
    def __init__(self, name, ftype, null_rate=10.0):
        self.name = name; self.field_type = ftype
        self.description = "[loan applicants]"
        self.constraints = C() if null_rate > 0 else CBool()
        if null_rate == 0:
            self.constraints.null_rate = 0.0

fields = [
    F("id",               "uuid",    null_rate=0),
    F("loan_amount",      "float",   null_rate=10),
    F("term_months",      "integer", null_rate=0),
    F("credit_score",     "integer", null_rate=10),
    F("annual_income",    "float",   null_rate=0),
    F("employment_years", "integer", null_rate=0),
    F("approved",         "boolean", null_rate=0),
    F("payment_id",       "integer", null_rate=0),
]

print("Running generate_relational_dataset for loan_applicants with null_rate=10 ...")
try:
    df, entity_tables = generate_relational_dataset(fields, 100, save_dir=None)
    print("SUCCESS!")
    print(f"  shape: {df.shape}")
    print(f"  columns: {df.columns.tolist()}")
    print(f"  entity_tables: {list(entity_tables.keys())}")
    null_counts = df.isnull().sum()
    print(f"  null counts: {null_counts[null_counts > 0].to_dict()}")
except Exception as e:
    import traceback
    print(f"FAILED: {e}")
    traceback.print_exc()
