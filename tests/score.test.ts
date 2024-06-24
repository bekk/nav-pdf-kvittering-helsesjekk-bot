import { describe, expect, mock, test } from 'bun:test'
import type { Answer, Asked, Team } from '@prisma/client'
import { addWeeks } from 'date-fns'

import { getTeamScorePerQuestion, getTeamScoreTimeline } from '../src/db/score.ts'
import { questionsToJsonb } from '../src/questions/jsonb-utils.ts'
import { Question, QuestionType } from '../src/safe-types.ts'
import { AnswerLevel, QuestionAnswer } from '../src/db'
import { getWeekNumber } from '../src/utils/date.ts'

const TEAM = 'ex-team'
const HIGH = AnswerLevel.GOOD
const MID = AnswerLevel.MEDIUM
const LOW = AnswerLevel.BAD

describe('getTeamScoreTimeline', () => {
    const someTimeInMay = new Date('2023-05-05T10:00:00')

    test('simple case with all positive', async () => {
        mockDb([
            createAsk(someTimeInMay, [
                createAnswers([HIGH, HIGH, HIGH]),
                createAnswers([HIGH, HIGH, HIGH]),
                createAnswers([HIGH, HIGH, HIGH]),
            ]),
        ])

        const [firstWeek] = await getTeamScoreTimeline(TEAM)

        expect(getWeekNumber(firstWeek.timestamp)).toEqual(18)
        expect(firstWeek.score).toEqual(5)
    })

    test('simple case with mixed responses', async () => {
        mockDb([
            createAsk(someTimeInMay, [
                createAnswers([HIGH, MID, LOW]),
                createAnswers([HIGH, MID, LOW]),
                createAnswers([HIGH, MID, LOW]),
            ]),
        ])

        const [firstWeek] = await getTeamScoreTimeline(TEAM)

        expect(getWeekNumber(firstWeek.timestamp)).toEqual(18)
        expect(firstWeek.score.toFixed(2)).toEqual('2.83')
    })
})

describe('getTeamScorePerQuestion', () => {
    const someTimeInMay = new Date('2023-05-05T10:00:00')

    test('correct distribution over multiple asks', async () => {
        mockDb([
            createAsk(someTimeInMay, [
                createAnswers([HIGH, MID, LOW]),
                createAnswers([HIGH, MID, LOW]),
                createAnswers([HIGH, MID, LOW]),
            ]),
            createAsk(addWeeks(someTimeInMay, 1), [
                createAnswers([HIGH, HIGH, HIGH]),
                createAnswers([HIGH, HIGH, HIGH]),
                createAnswers([HIGH, HIGH, HIGH]),
            ]),
        ])

        const [q1, q2, q3] = await getTeamScorePerQuestion(TEAM)

        expect(q1.scoring[0].averageScore).toEqual(5)
        expect(q1.scoring[0].distribution).toEqual({ GOOD: 3, MEDIUM: 0, BAD: 0 })
        expect(q1.scoring[1].averageScore).toEqual(5)
        expect(q1.scoring[1].distribution).toEqual({ GOOD: 3, MEDIUM: 0, BAD: 0 })

        expect(q2.scoring[0].averageScore).toEqual(2.5)
        expect(q2.scoring[0].distribution).toEqual({ GOOD: 0, MEDIUM: 3, BAD: 0 })
        expect(q2.scoring[1].averageScore).toEqual(5)
        expect(q2.scoring[1].distribution).toEqual({ GOOD: 3, MEDIUM: 0, BAD: 0 })

        expect(q3.scoring[0].averageScore).toEqual(1)
        expect(q3.scoring[0].distribution).toEqual({ GOOD: 0, MEDIUM: 0, BAD: 3 })
        expect(q3.scoring[1].averageScore).toEqual(5)
        expect(q3.scoring[1].distribution).toEqual({ GOOD: 3, MEDIUM: 0, BAD: 0 })
    })
})

function mockDb(asked: Asked[]): void {
    mock.module('../src/db/prisma.ts', () => ({
        prisma: () => ({
            team: {
                findFirst: () => createTeam(asked),
            },
        }),
    }))
}

const testQuestions: Question[] = [
    {
        questionId: 'question-1',
        question: 'How are you?',
        answers: {
            LOW: 'Not good',
            MEDIUM: 'Okay',
            HIGH: 'Great',
        },
        type: QuestionType.TEAM_HEALTH,
        custom: true,
    },
    {
        questionId: 'question-2',
        question: 'How was your day?',
        answers: {
            LOW: 'Bad',
            MEDIUM: 'Okay',
            HIGH: 'Good',
        },
        type: QuestionType.SPEED,
        custom: true,
    },
    {
        questionId: 'question-3',
        question: 'How are you feeling?',
        answers: {
            LOW: 'Sad',
            MEDIUM: 'Okay',
            HIGH: 'Happy',
        },
        type: QuestionType.TECH,
        custom: true,
    },
]

function createTeam(asks: Asked[]): Team & { Asked: Asked } {
    return {
        id: TEAM,
        revealDay: 4,
        revealHour: 12,
        postDay: 4,
        postHour: 10,
        frequency: 1,
        weekSkew: 0,
        active: true,
        questions: questionsToJsonb(testQuestions),
        name: 'Test Team',
        assosiatedGroup: null,
        Asked: asks,
    }
}

function createAsk(answered: Date = new Date(), answers?: Answer[]): Asked & { answers: Answer[] } {
    return {
        id: 'ask-1',
        teamId: TEAM,
        timestamp: answered,
        revealed: true,
        skipped: false,
        questions: testQuestions,
        answers: answers ?? [],
    }
}

function createAnswers(answers: [AnswerLevel, AnswerLevel, AnswerLevel]): Answer {
    return {
        userId: 'test-user',
        answeredAt: new Date(),
        askedId: 1,
        answers: answers.map(
            (ans, index) =>
                ({
                    questionId: testQuestions[index].questionId,
                    type: testQuestions[index].type,
                    answer: ans,
                }) satisfies QuestionAnswer,
        ),
    }
}
