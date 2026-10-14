CREATE INDEX prices_by_product_and_start ON prices (product_id, valid_from);

CREATE INDEX discounts_by_target ON discounts (target_kind, target_id);
