from pydantic import BaseModel, ConfigDict


class ORMBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class StrictBaseModel(ORMBaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
