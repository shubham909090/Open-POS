UPDATE `sale_groups`
SET `tax_components_json` = '[]'
WHERE `id` = 'sg-alcohol'
  AND `tax_components_json` LIKE '%VAT%';
