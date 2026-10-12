"""razorpay payments and seat-lock expiry

Adds what is needed to (a) hold seats for a limited time while the customer
pays and (b) link a payment row to a Razorpay order/payment.

  * bookings.expires_at                 – deadline of the seat lock
  * booking_status += EXPIRED           – lock lapsed before payment
  * payment_method += OTHER, now NULLable (method is only known after checkout)
  * payments.razorpay_order_id / razorpay_payment_id (unique) / failure_reason

Revision ID: c5e2f8a1b3d7
Revises: 4c223daec988
Create Date: 2026-10-06 10:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5e2f8a1b3d7"
down_revision: Union[str, Sequence[str], None] = "4c223daec988"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE must be committed before the value is usable, so
    # run it outside the migration's transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'EXPIRED'")
        op.execute("ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'OTHER'")

    op.add_column("bookings", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("payments", sa.Column("razorpay_order_id", sa.String(length=64), nullable=True))
    op.add_column("payments", sa.Column("razorpay_payment_id", sa.String(length=64), nullable=True))
    op.add_column("payments", sa.Column("failure_reason", sa.Text(), nullable=True))
    op.create_unique_constraint("payments_razorpay_order_id_key", "payments", ["razorpay_order_id"])
    op.create_unique_constraint("payments_razorpay_payment_id_key", "payments", ["razorpay_payment_id"])
    op.alter_column("payments", "payment_method", existing_type=sa.Enum(name="payment_method"), nullable=True)

    # Bookings left PENDING by the old (no-expiry) code would hold their seats
    # forever. Give them a deadline derived from when they were created, so the
    # first sweep releases the stale ones.
    op.execute(
        "UPDATE bookings "
        "SET expires_at = COALESCE(created_at, now()) + interval '10 minutes' "
        "WHERE status = 'PENDING' AND expires_at IS NULL"
    )


def downgrade() -> None:
    # Enum values cannot be dropped from a Postgres enum; EXPIRED / OTHER stay.
    op.execute("UPDATE payments SET payment_method = 'OTHER' WHERE payment_method IS NULL")
    op.alter_column("payments", "payment_method", existing_type=sa.Enum(name="payment_method"), nullable=False)
    op.drop_constraint("payments_razorpay_payment_id_key", "payments", type_="unique")
    op.drop_constraint("payments_razorpay_order_id_key", "payments", type_="unique")
    op.drop_column("payments", "failure_reason")
    op.drop_column("payments", "razorpay_payment_id")
    op.drop_column("payments", "razorpay_order_id")
    op.drop_column("bookings", "expires_at")
