package simple

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.littlelanguages.data.Tuple2
import io.littlelanguages.data.Union2
import io.littlelanguages.data.Union2a
import io.littlelanguages.data.Union2b
import simple.scanner.Scanner
import simple.scanner.Token
import java.io.StringReader

class ParserTests : StringSpec({
    "test - simple - id" {
        mkParser("abc").id() shouldBe "abc"
    }

    "test - simple - ids" {
        mkParser("").ids() shouldBe ""
        mkParser("hello").ids() shouldBe "hello"
        mkParser("hello world").ids() shouldBe "hello, world"
    }

    "test - simple - optional id" {
        mkParser("").optionalId() shouldBe ""
        mkParser("123").optionalId() shouldBe ""
        mkParser("hello").optionalId() shouldBe "hello"
    }

    "test - simple - many ids" {
        mkParser("hello").manyIds() shouldBe Tuple2("hello", "")
        mkParser("hello world").manyIds() shouldBe Tuple2("hello", "world")
        mkParser("hello world other").manyIds() shouldBe Tuple2("hello", "world, other")
    }

    "test - simple - alternative values" {
        mkParser("123").alternativeValues() shouldBe Union2b<String, Int>(123)
        mkParser("hello").alternativeValues() shouldBe Union2a<String, Int>("hello")
        mkParser("hello world").alternativeValues() shouldBe Union2a<String, Int>("hello, world")
    }

    "test - simple - optional many ids" {
        mkParser("").optionalManyIds() shouldBe null
        mkParser("hello").optionalManyIds() shouldBe "hello-"
        mkParser("hello many worlds").optionalManyIds() shouldBe "hello-many, worlds"
    }

    "test - simple - many alternative values" {
        mkParser("").manyAlternativeValues() shouldBe listOf()
        mkParser("hello").manyAlternativeValues() shouldBe listOf(Union2a<String, Int>("hello-"))
        mkParser("hello many worlds").manyAlternativeValues() shouldBe listOf(Union2a<String, Int>("hello-many, worlds"))
        mkParser("hello 123 world 456 war of the worlds").manyAlternativeValues() shouldBe listOf(
                Union2a<String, Int>("hello-"),
                Union2b<String, Int>(123),
                Union2a("world-"),
                Union2b(456),
                Union2a("war-of, the, worlds")
        )
    }

    "test - simple - many alternative optional values" {
        mkParser("").manyAlternativeOptionalValues() shouldBe listOf()
        mkParser("hello").manyAlternativeOptionalValues() shouldBe listOf(Union2a<String, Int>("hello-"))
        mkParser("hello many worlds").manyAlternativeOptionalValues() shouldBe listOf(Union2a<String, Int>("hello-many, worlds"))
        mkParser("hello 123 world 456 war of the worlds").manyAlternativeOptionalValues() shouldBe listOf(
                Union2a<String, Int>("hello-"),
                Union2b<String, Int>(123),
                Union2a("world-"),
                Union2b(456),
                Union2a("war-of, the, worlds")
        )
    }
})

fun mkParser(text: String) =
        Parser(Scanner(StringReader(text)), TestVisitor())

class TestVisitor : Visitor<
        String,
        String,
        String,
        Tuple2<String, String>,
        Union2<String, Int>,
        String?,
        List<Union2<String, Int>>,
        List<Union2<String, Int>>
        > {
    override fun visitId(a: Token): String = a.lexeme

    override fun visitIds(a: List<Token>): String = a.joinToString(", ") { it.lexeme }

    override fun visitOptionalId(a: String?): String = a ?: ""

    override fun visitManyIds(a1: String, a2: String): Tuple2<String, String> = Tuple2(a1, a2)

    override fun visitAlternativeValues1(a: String): Union2<String, Int> = Union2a(a)

    override fun visitAlternativeValues2(a: Token): Union2<String, Int> = Union2b(a.lexeme.toInt())

    override fun visitOptionalManyIds(a: Tuple2<String, String>?): String? =
            if (a == null) null else "${a.a}-${a.b}"

    override fun visitManyAlternativeValues(a: List<Union2<Tuple2<String, String>, Token>>): List<Union2<String, Int>> =
            a.map { if (it.isA()) Union2a<String, Int>("${it.a().a}-${it.a().b}") else Union2b<String, Int>(it.b().lexeme.toInt()) }

    override fun visitManyAlternativeOptionalValues(
            a: List<Union2<Tuple2<String, String>, Token?>>): List<Union2<String, Int>> =
            a.map {
                when {
                    it.isA() -> Union2a("${it.a().a}-${it.a().b}")
                    it.b() == null -> Union2a("<undefined>")
                    else -> {
                        val v = it.b()

                        if (v == null)
                            Union2a<String, Int>("<undefined>")
                        else
                            Union2b<String, Int>(v.lexeme.toInt())
                    }
                }
            }
}