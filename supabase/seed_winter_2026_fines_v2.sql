-- Winter 2026 Fines Import
-- Source: JP Fines 2026 - Winter 2025.csv
-- Status logic: Passed=FALSE â†’ dismissed | Passed=TRUE + Paid=FALSE â†’ upheld | Passed=TRUE + Paid=TRUE â†’ paid
-- Notes: combined from CSV columns H (Notes) and I (Minutes/60 seconds)
-- Run in Supabase SQL Editor

-- Adam Burnside | Incomplete Tightrope | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Adam%' AND name ILIKE '%Burnside%' LIMIT 1), 'Other', 'Incomplete Tightrope', 10.00, 'paid', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Corey Osborn | Incomplete Tightrope | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Corey%' AND name ILIKE '%Osborn%' LIMIT 1), 'Other', 'Incomplete Tightrope', 10.00, 'paid', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Gavin Hilliard | Incomplete Tightrope | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Gavin%' AND name ILIKE '%Hill%' LIMIT 1), 'Other', 'Incomplete Tightrope', 10.00, 'dismissed', 'Winter 2026', '2026-01-05', '2026-01-05', 'Tightrope don''t work');

-- James McClellan | Incomplete Tightrope | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%James%' AND name ILIKE '%McClellan%' LIMIT 1), 'Other', 'Incomplete Tightrope', 10.00, 'paid', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Robert Salas | Incomplete Tightrope | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Robert%' AND name ILIKE '%Sala%' LIMIT 1), 'Other', 'Incomplete Tightrope', 5.00, 'paid', 'Winter 2026', '2026-01-05', '2026-01-05', 'Reduced $5 â€” Did it late but earlier than some');

-- Reece Campbell | Missed WorkWeek | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Reece%' AND name ILIKE '%Campbell%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Missed Work Week', 15.00, 'paid', 'Winter 2026', '2026-01-05', '2026-01-05', 'Reduced $20 â€” Did not text Quinn, was watching dog');

-- Brandt Jackson | Missed WorkWeek | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Brandt%' AND name ILIKE '%Jackson%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Missed Work Week', 35.00, 'dismissed', 'Winter 2026', '2026-01-05', '2026-01-05', 'lower comms but reiterate communication');

-- Robert Salas | Missed WorkWeek | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Robert%' AND name ILIKE '%Sala%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Missed Work Week', 35.00, 'dismissed', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Harrison James | Missed WorkWeek | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Harrison%' AND name ILIKE '%James%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Missed Work Week', 35.00, 'dismissed', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Adam Burnside | Missed WorkWeek | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Adam%' AND name ILIKE '%Burnside%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Missed Work Week', 35.00, 'dismissed', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Andrew Huff | Missed WorkWeek | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Andrew%' AND name ILIKE '%Huff%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Missed Work Week', 35.00, 'dismissed', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Felipe Lucarelli | Missed WorkWeek | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Lucarelli%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Missed Work Week', 35.00, 'dismissed', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Kingston Hobbs | Missed WorkWeek | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Kingston%' AND name ILIKE '%Hobbs%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Missed Work Week', 35.00, 'dismissed', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Christian Epping | Missed WorkWeek | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Christian%' AND name ILIKE '%Epping%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Missed Work Week', 35.00, 'dismissed', 'Winter 2026', '2026-01-05', '2026-01-05', NULL);

-- Christian Epping | General Misconduct | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Christian%' AND name ILIKE '%Epping%' LIMIT 1), 'General Misconduct (Â§11-020)', 'General Misconduct', 10.00, 'paid', 'Winter 2026', '2026-01-10', '2026-01-10', 'jack did not shake his hand');

-- Christian Epping | Bathroom Trash Violation | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Christian%' AND name ILIKE '%Epping%' LIMIT 1), 'Bathroom Trash Violation (Â§11-290)', 'Bathroom Trash Violation', 5.00, 'dismissed', 'Winter 2026', '2026-01-10', '2026-01-10', NULL);

-- Oliver Olson | General Misconduct | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Oliver%' AND name ILIKE '%Olson%' LIMIT 1), 'General Misconduct (Â§11-020)', 'General Misconduct', 10.00, 'dismissed', 'Winter 2026', '2026-01-12', '2026-01-12', 'Grayson is free â€” did not show - left before decision');

-- Reece Campbell | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Reece%' AND name ILIKE '%Campbell%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-01-12', '2026-01-12', 'Paid same day');

-- Gavin Hilliard | Grazers | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Gavin%' AND name ILIKE '%Hill%' LIMIT 1), 'Grazers (Â§11-250)', 'Grazing', 5.00, 'dismissed', 'Winter 2026', '2026-01-15', '2026-01-15', 'dropped ellis');

-- Sid Sundaram | Grazers | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Sundaram%' LIMIT 1), 'Grazers (Â§11-250)', 'Grazing', 5.00, 'dismissed', 'Winter 2026', '2026-01-16', '2026-01-16', 'dropped ellis');

-- Cade Myers | Grazers | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Cade%' AND name ILIKE '%Myers%' LIMIT 1), 'Grazers (Â§11-250)', 'Grazing', 5.00, 'dismissed', 'Winter 2026', '2026-01-17', '2026-01-17', 'dropped ellis');

-- Reece Campbell | Grazers | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Reece%' AND name ILIKE '%Campbell%' LIMIT 1), 'Grazers (Â§11-250)', 'Grazing', 5.00, 'paid', 'Winter 2026', '2026-01-18', '2026-01-18', 'Dropped by Trenton');

-- Corey Osborn | Recruitment - Winter | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Corey%' AND name ILIKE '%Osborn%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Recruitment - Winter', 10.00, 'paid', 'Winter 2026', '2026-01-17', '2026-01-17', 'paid me on venmo');

-- Sam Brady | Recruitment - Winter | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Sam%' AND name ILIKE '%Brady%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Recruitment - Winter', 10.00, 'paid', 'Winter 2026', '2026-01-17', '2026-01-17', NULL);

-- Asher Holmes | Recruitment - Winter | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Asher%' AND name ILIKE '%Holmes%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Recruitment - Winter', 10.00, 'dismissed', 'Winter 2026', '2026-01-17', '2026-01-17', 'ellis dropped - had work');

-- Jasper Bradley | Recruitment - Winter | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jasper%' AND name ILIKE '%Bradley%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Recruitment - Winter', 10.00, 'dismissed', 'Winter 2026', '2026-01-17', '2026-01-17', NULL);

-- Jack Bourgeois | Recruitment - Winter | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jack%' AND name ILIKE '%Bourg%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Recruitment - Winter', 10.00, 'dismissed', 'Winter 2026', '2026-01-17', '2026-01-17', 'ellis dropped');

-- Felipe Lucarelli | Recruitment - Winter | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Lucarelli%' LIMIT 1), 'Missing Recruitment/Work Week (Â§11-070)', 'Recruitment - Winter', 10.00, 'dismissed', 'Winter 2026', '2026-01-17', '2026-01-17', NULL);

-- James McClellan | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%James%' AND name ILIKE '%McClellan%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-01-17', '2026-01-17', 'Quinn Dropped');

-- Calum Costa | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Calum%' AND name ILIKE '%Costa%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'Quinn dropped');

-- Felipe Lucarelli | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Lucarelli%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'did not know he had to go to houseclean');

-- Caleb Cupp | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Caleb%' AND name ILIKE '%Cupp%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'Quinn Dropped');

-- Christian Epping | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Christian%' AND name ILIKE '%Epping%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'Quinn Dropped');

-- Issac Coate | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Coate%' AND name NOT ILIKE '%Owen%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'Quinn Dropped');

-- Owen Coate | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Owen%' AND name ILIKE '%Coate%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'Quinn Dropped');

-- Christian Epping | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Christian%' AND name ILIKE '%Epping%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'Quinn Dropped');

-- Alex Radell | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Alex%' AND name ILIKE '%Radell%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'Quinn Dropped');

-- Tyshin Nguyen | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Tyshin%' AND name ILIKE '%Nguyen%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'Quinn Dropped');

-- Gabe Baker | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE (name ILIKE '%Gabe%' OR name ILIKE '%Gabriel%') AND name ILIKE '%Baker%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-01-18', '2026-01-18', 'Quinn Dropped');

-- Asher Holmes | General Misconduct | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Asher%' AND name ILIKE '%Holmes%' LIMIT 1), 'General Misconduct (Â§11-020)', 'General Misconduct', 10.00, 'upheld', 'Winter 2026', '2026-01-19', NULL, NULL);

-- Mason Allen | Highwire | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Mason%' AND name ILIKE '%Allen%' LIMIT 1), 'Other', 'Highwire', 10.00, 'dismissed', 'Winter 2026', '2026-01-20', '2026-01-20', NULL);

-- Gabe Baker | Highwire | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE (name ILIKE '%Gabe%' OR name ILIKE '%Gabriel%') AND name ILIKE '%Baker%' LIMIT 1), 'Other', 'Highwire', 10.00, 'dismissed', 'Winter 2026', '2026-01-20', '2026-01-20', NULL);

-- Cole Bartuska | Highwire | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Cole%' AND name ILIKE '%Bartuska%' LIMIT 1), 'Other', 'Highwire', 10.00, 'upheld', 'Winter 2026', '2026-01-20', NULL, 'Auto passed');

-- Jack Bourgeois | Highwire | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jack%' AND name ILIKE '%Bourg%' LIMIT 1), 'Other', 'Highwire', 10.00, 'paid', 'Winter 2026', '2026-01-20', '2026-01-20', 'Auto passed');

-- Sam Brady | Highwire | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Sam%' AND name ILIKE '%Brady%' LIMIT 1), 'Other', 'Highwire', 10.00, 'dismissed', 'Winter 2026', '2026-01-20', '2026-01-20', 'Cameron dropped (he did it)');

-- Reece Campbell | Highwire | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Reece%' AND name ILIKE '%Campbell%' LIMIT 1), 'Other', 'Highwire', 10.00, 'paid', 'Winter 2026', '2026-01-20', '2026-01-20', 'reece said he''d pay online');

-- Calin Cornell | Highwire | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Calin%' AND name ILIKE '%Cornell%' LIMIT 1), 'Other', 'Highwire', 10.00, 'dismissed', 'Winter 2026', '2026-01-20', '2026-01-20', 'Gonna do sum stupid');

-- Spencer Kitchen | Highwire | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Spencer%' AND name ILIKE '%Kitchen%' LIMIT 1), 'Other', 'Highwire', 10.00, 'paid', 'Winter 2026', '2026-01-20', '2026-01-20', 'Auto passed');

-- Cade Myers | Highwire | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Cade%' AND name ILIKE '%Myers%' LIMIT 1), 'Other', 'Highwire', 10.00, 'dismissed', 'Winter 2026', '2026-01-20', '2026-01-20', NULL);

-- Jace Vernam | Highwire | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jace%' AND name ILIKE '%Vernam%' LIMIT 1), 'Other', 'Highwire', 10.00, 'dismissed', 'Winter 2026', '2026-01-20', '2026-01-20', NULL);

-- Nikolas Vidmantis | Highwire | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Vidmantis%' LIMIT 1), 'Other', 'Highwire', 10.00, 'dismissed', 'Winter 2026', '2026-01-20', '2026-01-20', 'Worked an agreement out with JP (PD1)');

-- Colin Vignoul | Highwire | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Colin%' AND name ILIKE '%Vignoul%' LIMIT 1), 'Other', 'Highwire', 10.00, 'dismissed', 'Winter 2026', '2026-01-20', '2026-01-20', NULL);

-- Thomas Davis | TS | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Thomas%' AND name ILIKE '%Davis%' LIMIT 1), 'Other', 'TS (Tightrope Sequence)', 35.00, 'dismissed', 'Winter 2026', '2026-01-20', '2026-01-20', 'Finished it @11pm');

-- Eason Cox | Removal/Damage to House Property | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Eason%' AND name ILIKE '%Cox%' LIMIT 1), 'Removal/Damage to House Property (Â§11-080)', 'Destruction of House Property', 72.00, 'paid', 'Winter 2026', '2026-01-31', '2026-01-31', 'got new door');

-- Cameron Little | Removal/Damage to Personal Property | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Cameron%' AND name ILIKE '%Little%' LIMIT 1), 'Removal/Damage to Personal Property (Â§11-090)', 'Destruction of Personal Property', NULL, 'dismissed', 'Winter 2026', '2026-02-01', '2026-02-01', NULL);

-- Calin Cornell | Removal/Damage to Personal Property | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Calin%' AND name ILIKE '%Cornell%' LIMIT 1), 'Removal/Damage to Personal Property (Â§11-090)', 'Destruction of Personal Property', NULL, 'paid', 'Winter 2026', '2026-02-01', '2026-02-01', 'paid');

-- Tyshin Nguyen | General Misconduct | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Tyshin%' AND name ILIKE '%Nguyen%' LIMIT 1), 'General Misconduct (Â§11-020)', 'General Misconduct', 10.00, 'paid', 'Winter 2026', '2026-02-01', '2026-02-01', '**Important**');

-- Corey Osborn | General Misconduct | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Corey%' AND name ILIKE '%Osborn%' LIMIT 1), 'General Misconduct (Â§11-020)', 'General Misconduct', 10.00, 'paid', 'Winter 2026', '2026-02-01', '2026-02-01', 'paid thru zelle');

-- Elijah Adams | TS | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Elijah%' AND name ILIKE '%Adams%' LIMIT 1), 'Other', 'TS (Tightrope Sequence)', 35.00, 'dismissed', 'Winter 2026', '2026-02-02', '2026-02-02', NULL);

-- Robert Dick | General Misconduct | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Robert%' AND name ILIKE '%Dick%' LIMIT 1), 'General Misconduct (Â§11-020)', 'General Misconduct', 10.00, 'paid', 'Winter 2026', '2026-02-06', '2026-02-06', 'Door');

-- Camden Kauffman | General Misconduct | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Camden%' AND name ILIKE '%Kauffman%' LIMIT 1), 'General Misconduct (Â§11-020)', 'General Misconduct', 10.00, 'dismissed', 'Winter 2026', '2026-02-06', '2026-02-06', 'Door â€” paid for new door');

-- Spencer Kitchen | General Misconduct | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Spencer%' AND name ILIKE '%Kitchen%' LIMIT 1), 'General Misconduct (Â§11-020)', 'General Misconduct', 10.00, 'paid', 'Winter 2026', '2026-02-06', '2026-02-06', 'Door â€” Spencer pressing JP');

-- Eason Cox | Chores | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Eason%' AND name ILIKE '%Cox%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'paid', 'Winter 2026', '2026-02-09', '2026-02-09', 'Going to clean big bath to make up');

-- Luke Forsyth | General Misconduct | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Luke%' AND name ILIKE '%Forsyth%' LIMIT 1), 'General Misconduct (Â§11-020)', 'General Misconduct', 10.00, 'dismissed', 'Winter 2026', '2026-02-09', '2026-02-09', 'dropped');

-- Alex Radell | Chores | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Alex%' AND name ILIKE '%Radell%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'paid', 'Winter 2026', '2026-02-16', '2026-02-16', 'paid on cashapp');

-- Jack Bourgeois | Chores | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jack%' AND name ILIKE '%Bourg%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'paid', 'Winter 2026', '2026-02-16', '2026-02-16', 'Clean guest bath');

-- Asher Holmes | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Asher%' AND name ILIKE '%Holmes%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-02-16', '2026-02-16', NULL);

-- Tyshin Nguyen | Chores | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Tyshin%' AND name ILIKE '%Nguyen%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'paid', 'Winter 2026', '2026-02-16', '2026-02-16', 'mop highwing');

-- Elle Baker | Chores | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Elle%' AND name ILIKE '%Baker%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'paid', 'Winter 2026', '2026-02-16', '2026-02-16', 'paid in cash');

-- Dillon Berge | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Dillon%' AND name ILIKE '%Berge%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Elijah Adams | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Elijah%' AND name ILIKE '%Adams%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', 'extended');

-- Cole Bartuska | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Cole%' AND name ILIKE '%Bartuska%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Jack Bourgeois | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jack%' AND name ILIKE '%Bourg%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Jasper Bradley | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jasper%' AND name ILIKE '%Bradley%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-02-22', '2026-02-22', 'passed');

-- Sam Brady | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Sam%' AND name ILIKE '%Brady%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Reece Campbell | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Reece%' AND name ILIKE '%Campbell%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-02-22', '2026-02-22', 'paid');

-- Calum Costa | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Calum%' AND name ILIKE '%Costa%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Caleb Cupp | House Clean | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Caleb%' AND name ILIKE '%Cupp%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 5.00, 'upheld', 'Winter 2026', '2026-02-22', NULL, NULL);

-- Trent DuBurg | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Trent%' AND name ILIKE '%DuBurg%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Christian Epping | House Clean | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Christian%' AND name ILIKE '%Epping%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'upheld', 'Winter 2026', '2026-02-22', NULL, 'passed');

-- Dylan Featonby | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Dylan%' AND name ILIKE '%Featonby%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-02-22', '2026-02-22', 'will pay');

-- Ian Hansen | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Ian%' AND name ILIKE '%Hansen%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', 'wrong ian');

-- Austin Hart | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Austin%' AND name ILIKE '%Hart%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 5.00, 'paid', 'Winter 2026', '2026-02-22', '2026-02-22', 'no 67 â€” halfted');

-- Kingston Hobbs | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Kingston%' AND name ILIKE '%Hobbs%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Harrison James | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Harrison%' AND name ILIKE '%James%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-02-22', '2026-02-22', 'passed - chore');

-- Camden Kauffman | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Camden%' AND name ILIKE '%Kauffman%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-02-22', '2026-02-22', 'Texted me to pay');

-- Spencer Kitchen | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Spencer%' AND name ILIKE '%Kitchen%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-02-22', '2026-02-22', 'paid cashapp');

-- James McClellan | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%James%' AND name ILIKE '%McClellan%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', 'was taking care of calum');

-- Elle Baker | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Elle%' AND name ILIKE '%Baker%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Tristan Oliver | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Tristan%' AND name ILIKE '%Oliver%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', 'dropped');

-- Corey Osborn | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Corey%' AND name ILIKE '%Osborn%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', 'was phx');

-- Aiden Reedy | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Aiden%' AND name ILIKE '%Reedy%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-02-22', '2026-02-22', 'paid cashapp');

-- Tripp Riker | House Clean | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Tripp%' AND name ILIKE '%Riker%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'upheld', 'Winter 2026', '2026-02-22', NULL, 'asked for work');

-- Jace Vernam | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jace%' AND name ILIKE '%Vernam%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', 'auto passed');

-- Sam Brady | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Sam%' AND name ILIKE '%Brady%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Dylan Featonby | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Dylan%' AND name ILIKE '%Featonby%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', 'putting in more effort in chore then Sam.');

-- Corey Osborn | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Corey%' AND name ILIKE '%Osborn%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-02-22', '2026-02-22', NULL);

-- Ian Hansen | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Ian%' AND name ILIKE '%Hansen%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Jace Vernam | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jace%' AND name ILIKE '%Vernam%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Chris Hickey | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Chris%' AND name ILIKE '%Hickey%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Brandt Jackson | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Brandt%' AND name ILIKE '%Jackson%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Cole Bartuska | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Cole%' AND name ILIKE '%Bartuska%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Elle Baker | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Elle%' AND name ILIKE '%Baker%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Alex Radell | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Alex%' AND name ILIKE '%Radell%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Dylan Featonby | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Dylan%' AND name ILIKE '%Featonby%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Hayden Ramberg | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Hayden%' AND name ILIKE '%Ramberg%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Jasper Bradley | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jasper%' AND name ILIKE '%Bradley%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Jack Bourgeois | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jack%' AND name ILIKE '%Bourg%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Andrew Ng | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Andrew%' AND name ILIKE '%Ng%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Gavin Hilliard | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Gavin%' AND name ILIKE '%Hill%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Robert Salas | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Robert%' AND name ILIKE '%Sala%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Thomas Davis | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Thomas%' AND name ILIKE '%Davis%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Harrison James | Scholarship Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Harrison%' AND name ILIKE '%James%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Scholarship Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-02-23', '2026-02-23', '10-020');

-- Christian Epping | Grazers | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Christian%' AND name ILIKE '%Epping%' LIMIT 1), 'Grazers (Â§11-250)', 'Grazing', 5.00, 'paid', 'Winter 2026', '2026-02-23', '2026-02-23', 'Breakfast Beer or Nudie Lap, every week he doesn''t +1 egg or lap (at chapter)');

-- Spencer Kitchen | Social Probation Violation | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Spencer%' AND name ILIKE '%Kitchen%' LIMIT 1), 'Social Probation Violation (Â§11-260)', 'Social Probation Violation', 15.00, 'upheld', 'Winter 2026', '2026-03-01', NULL, NULL);

-- Gavin Hilliard | Chores | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Gavin%' AND name ILIKE '%Hill%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'paid', 'Winter 2026', '2026-03-01', '2026-03-01', 'He paid');

-- Christian Epping | Chores | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Christian%' AND name ILIKE '%Epping%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'dismissed', 'Winter 2026', '2026-03-01', '2026-03-01', 'auto passed');

-- Tripp Riker | Chores | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Tripp%' AND name ILIKE '%Riker%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'upheld', 'Winter 2026', '2026-03-09', NULL, 'asked for work');

-- Kingston Hobbs | Chores | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Kingston%' AND name ILIKE '%Hobbs%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 5.00, 'paid', 'Winter 2026', '2026-03-09', '2026-03-09', '-5 â€” came in together');

-- Corey Osborn | Chores | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Corey%' AND name ILIKE '%Osborn%' LIMIT 1), 'Chores (Â§11-160)', 'Chore Violation', 10.00, 'paid', 'Winter 2026', '2026-03-09', '2026-03-09', NULL);

-- Camden Kauffman | Cell Phone in Exec Meeting | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Camden%' AND name ILIKE '%Kauffman%' LIMIT 1), 'Cell Phone in Exec Meeting (Â§8-060)', 'Phone in Meeting', 5.00, 'dismissed', 'Winter 2026', '2026-03-09', '2026-03-09', NULL);

-- Urjit Sharma | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Urjit%' AND name ILIKE '%Sharma%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-03-16', '2026-03-16', 'said hell pay');

-- Solomon Bowman | House Clean | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Solomon%' AND name ILIKE '%Bowman%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'upheld', 'Winter 2026', '2026-03-16', NULL, 'pay cashapp');

-- Mason Allen | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Mason%' AND name ILIKE '%Allen%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Dylan Buck | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Dylan%' AND name ILIKE '%Buck%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Reece Campbell | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Reece%' AND name ILIKE '%Campbell%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-03-16', '2026-03-16', 'Said he will pay cashapp');

-- Dylan Featonby | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Dylan%' AND name ILIKE '%Featonby%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Gavin Hilliard | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Gavin%' AND name ILIKE '%Hill%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Oscar Rodriguez | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Oscar%' AND name ILIKE '%Rodriguez%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-03-16', '2026-03-16', 'paid me on venmo');

-- Calum Costa | House Clean | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Calum%' AND name ILIKE '%Costa%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'paid', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Marcos Nunez | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Marcos%' AND name ILIKE '%Nunez%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Felipe Lucarelli | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Lucarelli%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Kingston Hobbs | House Clean | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Kingston%' AND name ILIKE '%Hobbs%' LIMIT 1), 'House Clean (Â§11-140)', 'Missing House Clean', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Corey Osborn | Formal Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Corey%' AND name ILIKE '%Osborn%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Formal Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Ian Hansen | Formal Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Ian%' AND name ILIKE '%Hansen%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Formal Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Brandt Jackson | Formal Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Brandt%' AND name ILIKE '%Jackson%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Formal Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Cade Olson | Formal Dinner | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Cade%' AND name ILIKE '%Olson%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Formal Dinner', 10.00, 'dismissed', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Jack Bourgeois | Formal Dinner | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jack%' AND name ILIKE '%Bourg%' LIMIT 1), 'Missing Required Event (Â§11-060)', 'Missing Formal Dinner', 10.00, 'paid', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Kingston Hobbs | TS | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Kingston%' AND name ILIKE '%Hobbs%' LIMIT 1), 'Other', 'TS (Tightrope Sequence)', 35.00, 'upheld', 'Winter 2026', '2026-03-16', NULL, NULL);

-- Corey Osborn | TS | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Corey%' AND name ILIKE '%Osborn%' LIMIT 1), 'Other', 'TS (Tightrope Sequence)', 35.00, 'paid', 'Winter 2026', '2026-03-16', '2026-03-16', NULL);

-- Tripp Riker | TS | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Tripp%' AND name ILIKE '%Riker%' LIMIT 1), 'Other', 'TS (Tightrope Sequence)', 35.00, 'upheld', 'Winter 2026', '2026-03-16', NULL, 'asking for work');

-- Mason Allen | Missing Philanthropy Hours | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Mason%' AND name ILIKE '%Allen%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 100.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Spencer Kitchen | Missing Philanthropy Hours | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Spencer%' AND name ILIKE '%Kitchen%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 100.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Cade Olson | Missing Philanthropy Hours | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Cade%' AND name ILIKE '%Olson%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 100.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Louden Philbrick | Missing Philanthropy Hours | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Louden%' AND name ILIKE '%Philbrick%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 30.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', 'double hours - 6hr');

-- Colin Vignoul | Missing Philanthropy Hours | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Colin%' AND name ILIKE '%Vignoul%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 100.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', 'said he will pay');

-- Cameron Little | Missing Philanthropy Hours | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Cameron%' AND name ILIKE '%Little%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 15.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Sam Felstad | Missing Philanthropy Hours | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Sam%' AND name ILIKE '%Felstad%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 100.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Robert Dick | Missing Philanthropy Hours | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Robert%' AND name ILIKE '%Dick%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 20.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', 'paid cashapp');

-- Kingston Hobbs | Missing Philanthropy Hours | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Kingston%' AND name ILIKE '%Hobbs%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 100.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Harrison James | Missing Philanthropy Hours | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Harrison%' AND name ILIKE '%James%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 100.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', 'gave me cash');

-- Adam Burnside | Missing Philanthropy Hours | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Adam%' AND name ILIKE '%Burnside%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 100.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Urjit Sharma | Missing Philanthropy Hours + Blood | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Urjit%' AND name ILIKE '%Sharma%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 100.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Aidan Manzuk | Missing Philanthropy Hours + Blood | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Aidan%' AND name ILIKE '%Manzuk%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 110.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', '15hrs spring term - no money');

-- Sam Brady | Missing Philanthropy Hours + Blood | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Sam%' AND name ILIKE '%Brady%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 110.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', '2 blood hours, 8hrs charged, work 5hrs');

-- Alex Radell | Missing Philanthropy Hours + Blood | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Alex%' AND name ILIKE '%Radell%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 60.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Dylan Featonby | Missing Philanthropy Hours + Blood | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Dylan%' AND name ILIKE '%Featonby%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 110.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', '15 service hours this term');

-- Hayden Ramberg | Missing Philanthropy Hours + Blood | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Hayden%' AND name ILIKE '%Ramberg%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 110.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Jasper Bradley | Missing Philanthropy Hours + Blood | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jasper%' AND name ILIKE '%Bradley%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 90.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', '-2 hrs for park clean');

-- Asher Holmes | Missing Philanthropy Hours + Blood | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Asher%' AND name ILIKE '%Holmes%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 30.00, 'upheld', 'Winter 2026', '2026-03-30', NULL, '13hrs this term');

-- Elijah Adams | Missing Philanthropy Hours + Blood | upheld
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Elijah%' AND name ILIKE '%Adams%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 30.00, 'upheld', 'Winter 2026', '2026-03-30', NULL, 'said he will pay');

-- Calum Costa | Missing Philanthropy Hours + Blood | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Calum%' AND name ILIKE '%Costa%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 110.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', '10hrs next term not counting sing');

-- Robert Salas | Missing Philanthropy Hours + Blood | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Robert%' AND name ILIKE '%Sala%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 110.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Oscar Rodriguez | Missing Philanthropy Hours + Blood | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Oscar%' AND name ILIKE '%Rodriguez%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours + Blood Drive', 30.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', 'venmo me');

-- Issac Coate | Missing Philanthropy Hours | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Coate%' AND name NOT ILIKE '%Owen%' LIMIT 1), 'Missing Philanthropy Hours (Â§16-010)', 'Missing Service Hours', 30.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- Jack Bourgeois | Missing Blood Drive | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Jack%' AND name ILIKE '%Bourg%' LIMIT 1), 'Missing Blood Drive (Â§16-010)', 'Missing Blood Drive', 10.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);

-- James McClellan | Missing Blood Drive | paid
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%James%' AND name ILIKE '%McClellan%' LIMIT 1), 'Missing Blood Drive (Â§16-010)', 'Missing Blood Drive', 10.00, 'paid', 'Winter 2026', '2026-03-30', '2026-03-30', 'paid on venmo');

-- Luke Forsyth | Missing Blood Drive | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Luke%' AND name ILIKE '%Forsyth%' LIMIT 1), 'Missing Blood Drive (Â§16-010)', 'Missing Blood Drive', 10.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', 'did it');

-- Tristan Oliver | Missing Blood Drive | dismissed
INSERT INTO public.fines (member_id, fine_type, description, amount, status, term, date_issued, date_resolved, notes)
VALUES ((SELECT id FROM members WHERE name ILIKE '%Tristan%' AND name ILIKE '%Oliver%' LIMIT 1), 'Missing Blood Drive (Â§16-010)', 'Missing Blood Drive', 10.00, 'dismissed', 'Winter 2026', '2026-03-30', '2026-03-30', NULL);
