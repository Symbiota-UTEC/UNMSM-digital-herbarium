# backend/services/admin_metrics.py
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from backend.models.enums import RegistrationStatus
from backend.models.models import Collection, Occurrence, RegistrationRequest, User
from backend.schemas.admin import AdminMetricsOut


def get_admin_metrics(db: Session, current_user: User) -> AdminMetricsOut:
    inst_id = current_user.institutionId

    def totals(institution_count: int, app_count: int | None):
        data = {"institution": institution_count}
        if current_user.isSuperuser and app_count is not None:
            data["app"] = app_count
        return data

    if current_user.isSuperuser:
        coll_row = db.execute(
            select(
                func.count(Collection.collectionId).label("app"),
                func.sum(
                    case(
                        (Collection.institutionId == inst_id, 1),
                        else_=0,
                    )
                ).label("institution"),
            )
        ).one()

        users_row = db.execute(
            select(
                func.count(User.userId).label("app"),
                func.sum(
                    case(
                        (User.institutionId == inst_id, 1),
                        else_=0,
                    )
                ).label("institution"),
            )
        ).one()

        req_row = db.execute(
            select(
                func.sum(
                    case(
                        (RegistrationRequest.status == RegistrationStatus.PENDING, 1),
                        else_=0,
                    )
                ).label("app"),
                func.sum(
                    case(
                        (
                            (RegistrationRequest.status == RegistrationStatus.PENDING)
                            & (RegistrationRequest.institutionId == inst_id),
                            1,
                        ),
                        else_=0,
                    )
                ).label("institution"),
            )
        ).one()

        # --- Occurrences ---
        occ_row = db.execute(
            select(
                func.count(Occurrence.occurrenceId).label("app"),
                func.sum(
                    case(
                        (Collection.institutionId == inst_id, 1),
                        else_=0,
                    )
                ).label("institution"),
            )
            .select_from(Occurrence)
            .join(
                Collection,
                Occurrence.collectionId == Collection.collectionId,
                isouter=True,
            )
        ).one()

        collections_totals = totals(coll_row.institution or 0, coll_row.app or 0)
        users_totals = totals(users_row.institution or 0, users_row.app or 0)
        requests_totals = totals(req_row.institution or 0, req_row.app or 0)
        occurrences_totals = totals(occ_row.institution or 0, occ_row.app or 0)

    else:
        collections_inst = (
            db.scalar(
                select(func.count(Collection.collectionId)).where(
                    Collection.institutionId == inst_id
                )
            )
            or 0
        )
        users_inst = (
            db.scalar(select(func.count(User.userId)).where(User.institutionId == inst_id)) or 0
        )
        requests_inst = (
            db.scalar(
                select(func.count(RegistrationRequest.registrationRequestId)).where(
                    RegistrationRequest.status == RegistrationStatus.PENDING,
                    RegistrationRequest.institutionId == inst_id,
                )
            )
            or 0
        )
        occurrences_inst = (
            db.scalar(
                select(func.count(Occurrence.occurrenceId))
                .join(Collection, Occurrence.collectionId == Collection.collectionId)
                .where(Collection.institutionId == inst_id)
            )
            or 0
        )

        collections_totals = totals(collections_inst, None)
        users_totals = totals(users_inst, None)
        requests_totals = totals(requests_inst, None)
        occurrences_totals = totals(occurrences_inst, None)

    return AdminMetricsOut(
        institutionId=inst_id,
        metrics={
            "collections": collections_totals,
            "users": users_totals,
            "requestsPending": requests_totals,
            "occurrences": occurrences_totals,
        },
    )
