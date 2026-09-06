-- CreateIndex
CREATE UNIQUE INDEX "category_rules_business_id_match_type_pattern_key"
  ON "category_rules"("business_id", "match_type", "pattern");
