Inroads MVP import
==================

Upload one zip that contains:
  - lesson.xls or lesson.xlsx (workbook)
  - one video per named folder (the folder name is how the system places the file)

Download template is that zip with lesson.xlsx and the named folders already created.
Put one video in each folder you want filled. On import, the workbook and those videos
are applied to the builder together (intro, Observe, Process, Anticipate slots).

Folder names (case-insensitive):

  Intro Video/
  Observe Hazard Scenario/
  Hazard Summary Audio/       (MP3, M4A, WAV, or OGG — plays after Observe Start)
  Observe Coaching Video/     (missed-hazard / coaching clip on Observe)
  Observe Explanation Image/  (JPG, PNG, WebP, or GIF)
  Process Lesson/
  Process Coaching Video/     (Process Video 2)
  Anticipate Lesson/
  Anticipate Coaching Video/  (Anticipate Video 2)

Required folders: none. Videos in the named folders are optional.

Workbook sheets
---------------
Lesson: column A = key, column B = value
  title
  description
  intro_first_visit     true or false

Copy: header row, then section | field | text
  section: observe | process | anticipate
  field: instruction | instruction_pill | second_instruction |
         second_instruction_pill | second_score_threshold
  Observe also uses: hazard_name | core_competency | hazard_explanation |
         maneuver | roadway | traffic_density | time_of_day | road_conditions |
         success_result | fail_screen | 2_attempts | 3_attempts | time_out |
         missed_1_attempt | missed_2_attempts
  Observe instruction / instruction_pill = scenario overlay on the hazard clip
  Observe maneuver / roadway / traffic_density / time_of_day / road_conditions
         = summary card after Start, before the first video
  Observe second_instruction / second_instruction_pill = coaching clip overlay
  Observe success_result / fail_screen / 2_attempts / 3_attempts / time_out /
         missed_1_attempt / missed_2_attempts = Observe hazard results screen
  core_competency: Attitude | Speed Management | Space Management |
                   Danger Zones | Scanning | Other Motorists

Questions: one row per Observe, Process, or Anticipate question
  Visible: section | kind | question_text | explanation | correct | a_text | b_text | c_text
  Hidden/locked: segment, show_explanation, show_correct_incorrect,
                 a–c points, and D–F answers
  section: observe | process | anticipate
  kind: severity | theory
  correct: A-C
  Correct answers are always worth 10 points.
  Observe questions attach to the first Observe hazard.

Lesson intro_first_visit and Copy second_score_threshold rows are hidden and locked.

Draw additional tap hazards in the Observe editor after import if needed.

Videos: .mp4, .webm, or .mov
Images: .jpg, .jpeg, .png, .webp, .gif
Audio: .mp3, .m4a, .wav, or .ogg
