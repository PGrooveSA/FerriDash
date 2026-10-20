# FerriDash CSV import templates

Three templates for loading a school's data, one row per record. Fill them in this order, because later files refer to earlier ones:

1. `1-classes-and-subjects.csv`: classes and the subjects taught in each.
2. `2-teachers.csv`: educators and their register class.
3. `3-learners-and-parents.csv`: learners, their class and up to two parents or guardians.

The example rows are fictional. Delete them and keep the header row exactly as it is.

## General rules

- **Dates** use `YYYY-MM-DD`, for example `2012-05-09`.
- **Grade R** is written as `R`. Grades 1 to 12 are written as numbers.
- **Class names** start with the grade, for example `8A`, `10B` or `R1`. Use the same spelling in all three files.
- **Emails** must be unique across the whole system. Each one becomes that person's login.
- **ID numbers** are 13-digit South African ID numbers with a valid check digit. Leave the cell empty if the number is unknown.
- **Empty cells** are fine for any column not marked *required*.
- **Save as** CSV UTF-8 (comma delimited).

> **Excel warning:** Excel turns 13-digit ID numbers into `1.20509E+12` and drops leading zeros from numbers. Before typing or pasting, select the `id_number`, `persal_number`, `sace_number` and `cell` columns and set them to **Text** (Home → Number format → Text). Or open the CSV with Data → From Text/CSV and set those columns to Text.

## 1. Classes and subjects

One row per subject per class. Repeat the class on each row.

| Column | Required | Allowed values / notes |
|---|---|---|
| class | yes | e.g. `8A`, `10B`, `R1` |
| grade | yes | `R`, `1` to `12` |
| room | | e.g. `Room 12` |
| subject | yes | e.g. `Mathematics`. Same spelling for every class. |
| subject_code | | e.g. `MATH` |
| caps_category | yes | `HL` Home Language, `FAL` First Additional Language, `SAL` Second Additional Language, `MATH` Mathematics, `MLIT` Mathematical Literacy, `LO` Life Orientation / Life Skills, `OTHER`. Used for the CAPS promotion rules. |
| teacher_email | | The email of the teacher who teaches this subject in this class. It must match a row in `2-teachers.csv`. Leave empty if unallocated. |

## 2. Teachers

| Column | Required | Allowed values / notes |
|---|---|---|
| title | | `Mr`, `Ms`, `Mrs`, `Dr`, `Prof` |
| first_name, last_name | yes | |
| email | yes | Login email |
| cell | | e.g. `+27 82 555 0101` |
| id_number | | 13-digit SA ID |
| gender | | `Female`, `Male`, `Other` |
| staff_number, persal_number, sace_number | | |
| post_level | | `PL1`, `PL2 (HOD)`, `PL3 (Deputy)`, `PL4 (Principal)`. Defaults to `PL1`. |
| employed_since | | Date |
| register_class | | The class they take the register for, e.g. `8A` |
| address | | |

## 3. Learners and parents

| Column | Required | Allowed values / notes |
|---|---|---|
| admission_number | yes | Unique at the school, e.g. `2026-0001` |
| first_name, last_name | yes | |
| id_number | | 13-digit SA ID. Gender and date of birth are filled from it when left empty. |
| gender | | `Female`, `Male`, `Other` |
| date_of_birth | | Date |
| class | | A class from `1-classes-and-subjects.csv` |
| home_language | | `English`, `Afrikaans`, `isiZulu`, `isiXhosa`, `Sepedi`, `Setswana`, `Sesotho`, `Xitsonga`, `siSwati`, `Tshivenda`, `isiNdebele`, `SA Sign Language` |
| address | | |
| enrolled_on | | Date first enrolled |
| learner_login_email | | Only if the learner should have their own login |
| parent_title | | `Mr`, `Ms`, `Mrs`, `Dr`, `Prof` |
| parent_first_name, parent_last_name | with parent_email | |
| parent_email | | Parent's login. If two learners share a parent, use the same email on both rows; the parent gets one account linked to both children. |
| parent_cell | | |
| relationship | | `Mother`, `Father`, `Guardian`, `Grandparent`, `Foster parent` |
| parent2_… | | The same columns again for a second parent or guardian |

New logins get a temporary password. Admins can set a new password from the Teachers, Learners or Parents page.
