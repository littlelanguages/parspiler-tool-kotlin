import io.littlelanguages.scanpiler.*

fun <T> abstractTokens(scanner: AbstractScanner<T>, eos: T): List<AbstractToken<T>> {
    val result = mutableListOf<AbstractToken<T>>()

    do {
        result.add(scanner.current())
        scanner.next()
    } while (scanner.current().tToken != eos);

    return result
}

fun range(o1: Int, l1: Int, c1: Int, o2: Int, l2: Int, c2: Int): Location =
        LocationRange(LocationCoordinate(o1, l1, c1), LocationCoordinate(o2, l2, c2))