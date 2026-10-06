import unittest

from sqlalchemy import create_mock_engine

from backend.models.models import Base


class SchemaDdlCompatibilityTests(unittest.TestCase):
    def test_postgresql_metadata_ddl_supports_geoalchemy_columns(self):
        engine = create_mock_engine("postgresql://", lambda *args, **kwargs: None)

        Base.metadata.create_all(engine)


if __name__ == "__main__":
    unittest.main()
